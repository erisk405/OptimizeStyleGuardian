import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { AnalysisResult, ScanOptions } from './types';

export class RustBridge {
    private enginePath: string;

    constructor(private context: vscode.ExtensionContext) {
        // Determine the path to the Rust engine binary
        const isWindows = process.platform === 'win32';
        const engineName = isWindows ? 'go5_engine.exe' : 'go5_engine';

        // First try development path
        const devPath = path.join(context.extensionPath, 'engine', 'target', 'release', engineName);

        // Then try packaged path
        const prodPath = path.join(context.extensionPath, 'bin', engineName);

        if (fs.existsSync(devPath)) {
            this.enginePath = devPath;
        } else if (fs.existsSync(prodPath)) {
            this.enginePath = prodPath;
        } else {
            this.enginePath = devPath; // Default to dev path, will error if not found
        }
    }

    async analyze(options: ScanOptions): Promise<AnalysisResult> {
        return new Promise((resolve, reject) => {
            // Check if engine exists
            if (!fs.existsSync(this.enginePath)) {
                reject(new Error(
                    `Rust engine not found at ${this.enginePath}. ` +
                    `Please run "npm run build:engine" to compile the engine.`
                ));
                return;
            }

            const args = [
                '--workspace-root', options.workspaceRoot,
                '--similarity', (options.similarity || 90).toString(),
            ];

            // Add paths to scan
            options.paths.forEach(p => {
                args.push('--path', p);
            });

            // Add config path if specified
            if (options.configPath) {
                args.push('--config', options.configPath);
            }

            // Add performance thresholds
            if (options.performanceThresholds) {
                const { jsBundleKb, cssSizeKb, imageSizeKb } = options.performanceThresholds;
                if (jsBundleKb) args.push('--js-threshold', jsBundleKb.toString());
                if (cssSizeKb) args.push('--css-threshold', cssSizeKb.toString());
                if (imageSizeKb) args.push('--image-threshold', imageSizeKb.toString());
            }

            // Add enabled categories
            if (options.enabledCategories) {
                if (options.enabledCategories.duplicateStyles === false) {
                    args.push('--disable-duplicates');
                }
                if (options.enabledCategories.designSystem === false) {
                    args.push('--disable-design-system');
                }
                if (options.enabledCategories.performance === false) {
                    args.push('--disable-performance');
                }
            }

            // Add exclude patterns
            if (options.excludePatterns && options.excludePatterns.length > 0) {
                options.excludePatterns.forEach(pattern => {
                    args.push('--exclude', pattern);
                });
            }

            const child: ChildProcess = spawn(this.enginePath, args, {
                cwd: options.workspaceRoot,
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            child.on('error', (error) => {
                reject(new Error(`Failed to start Rust engine: ${error.message}`));
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Rust engine exited with code ${code}\n${stderr}`));
                    return;
                }

                try {
                    const result: AnalysisResult = JSON.parse(stdout);
                    resolve(result);
                } catch (error) {
                    reject(new Error(`Failed to parse engine output: ${error}\n${stdout}`));
                }
            });
        });
    }

    async checkEngineAvailability(): Promise<{ available: boolean; path: string; error?: string }> {
        const exists = fs.existsSync(this.enginePath);

        if (!exists) {
            return {
                available: false,
                path: this.enginePath,
                error: 'Engine binary not found. Run "npm run build:engine" to compile.'
            };
        }

        return {
            available: true,
            path: this.enginePath
        };
    }
}
