import * as vscode from 'vscode';

const API_KEY_SECRET_KEY = 'go5StyleGuardian.anthropicApiKey';

export class ApiKeyManager {
    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Get the stored API key from secure storage
     */
    async getApiKey(): Promise<string | undefined> {
        return await this.context.secrets.get(API_KEY_SECRET_KEY);
    }

    /**
     * Store API key securely
     */
    async setApiKey(apiKey: string): Promise<void> {
        if (!this.validateApiKey(apiKey)) {
            throw new Error('Invalid API key format. Anthropic API keys should start with "sk-ant-"');
        }
        await this.context.secrets.store(API_KEY_SECRET_KEY, apiKey);
    }

    /**
     * Remove stored API key
     */
    async removeApiKey(): Promise<void> {
        await this.context.secrets.delete(API_KEY_SECRET_KEY);
    }

    /**
     * Check if API key is configured
     */
    async hasApiKey(): Promise<boolean> {
        const key = await this.getApiKey();
        return !!key;
    }

    /**
     * Validate API key format
     */
    private validateApiKey(apiKey: string): boolean {
        // Basic validation: Anthropic API keys start with 'sk-ant-'
        return apiKey.trim().startsWith('sk-ant-') && apiKey.length > 20;
    }

    /**
     * Show input box to configure API key
     */
    async promptForApiKey(): Promise<boolean> {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Anthropic API Key',
            password: true,
            placeHolder: 'sk-ant-...',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value) {
                    return 'API key is required';
                }
                if (!value.startsWith('sk-ant-')) {
                    return 'Invalid API key format. Should start with "sk-ant-"';
                }
                return null;
            }
        });

        if (!apiKey) {
            return false;
        }

        try {
            await this.setApiKey(apiKey);
            vscode.window.showInformationMessage('✓ Anthropic API key saved successfully!');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save API key: ${error}`);
            return false;
        }
    }

    /**
     * Show quick pick menu for API key management
     */
    async manageApiKey(): Promise<void> {
        const hasKey = await this.hasApiKey();

        const options: vscode.QuickPickItem[] = [
            {
                label: hasKey ? '$(pencil) Update API Key' : '$(add) Set API Key',
                description: hasKey ? 'Change your Anthropic API key' : 'Configure your Anthropic API key'
            }
        ];

        if (hasKey) {
            options.push({
                label: '$(trash) Remove API Key',
                description: 'Delete stored API key'
            });
            options.push({
                label: '$(check) Test API Key',
                description: 'Verify API key is valid'
            });
        }

        const choice = await vscode.window.showQuickPick(options, {
            placeHolder: 'Manage Anthropic API Key'
        });

        if (!choice) {
            return;
        }

        if (choice.label.includes('Set') || choice.label.includes('Update')) {
            await this.promptForApiKey();
        } else if (choice.label.includes('Remove')) {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to remove your API key?',
                'Yes',
                'No'
            );
            if (confirm === 'Yes') {
                await this.removeApiKey();
                vscode.window.showInformationMessage('API key removed');
            }
        } else if (choice.label.includes('Test')) {
            const key = await this.getApiKey();
            if (key) {
                vscode.window.showInformationMessage(
                    `API key is configured (${key.substring(0, 12)}...)`
                );
            }
        }
    }
}
