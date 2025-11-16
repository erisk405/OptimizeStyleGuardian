// Example JavaScript file to test performance detection

// This file is intentionally large (will be flagged if over threshold)
// In real world, this would be a bundle or large component file

class UserDashboard {
    constructor() {
        this.users = [];
        this.settings = {};
        this.analytics = {};
    }

    // Simulating a large component with many methods
    initializeDashboard() {
        console.log('Initializing dashboard...');
        this.loadUsers();
        this.loadSettings();
        this.loadAnalytics();
        this.setupEventListeners();
        this.renderUI();
    }

    loadUsers() {
        // Simulate data loading
        fetch('/api/users')
            .then(response => response.json())
            .then(data => {
                this.users = data;
                this.renderUserList();
            });
    }

    loadSettings() {
        fetch('/api/settings')
            .then(response => response.json())
            .then(data => {
                this.settings = data;
                this.applySettings();
            });
    }

    loadAnalytics() {
        fetch('/api/analytics')
            .then(response => response.json())
            .then(data => {
                this.analytics = data;
                this.renderCharts();
            });
    }

    setupEventListeners() {
        document.querySelectorAll('.user-card').forEach(card => {
            card.addEventListener('click', this.handleUserClick.bind(this));
        });

        document.getElementById('search').addEventListener('input', this.handleSearch.bind(this));
        document.getElementById('filter').addEventListener('change', this.handleFilter.bind(this));
    }

    handleUserClick(event) {
        const userId = event.currentTarget.dataset.userId;
        this.showUserDetails(userId);
    }

    handleSearch(event) {
        const query = event.target.value.toLowerCase();
        this.filterUsers(query);
    }

    handleFilter(event) {
        const filterValue = event.target.value;
        this.applyFilter(filterValue);
    }

    renderUI() {
        this.renderHeader();
        this.renderSidebar();
        this.renderMainContent();
        this.renderFooter();
    }

    renderHeader() {
        const header = document.getElementById('header');
        header.innerHTML = `
            <div class="header-content">
                <h1>Dashboard</h1>
                <nav>
                    <a href="#home">Home</a>
                    <a href="#users">Users</a>
                    <a href="#settings">Settings</a>
                </nav>
            </div>
        `;
    }

    renderSidebar() {
        const sidebar = document.getElementById('sidebar');
        const menuItems = [
            { icon: 'home', label: 'Home', link: '#home' },
            { icon: 'person', label: 'Users', link: '#users' },
            { icon: 'settings', label: 'Settings', link: '#settings' },
            { icon: 'analytics', label: 'Analytics', link: '#analytics' }
        ];

        sidebar.innerHTML = menuItems.map(item => `
            <a href="${item.link}" class="menu-item">
                <span class="icon">${item.icon}</span>
                <span class="label">${item.label}</span>
            </a>
        `).join('');
    }

    renderMainContent() {
        const main = document.getElementById('main');
        main.innerHTML = '<div id="user-list"></div><div id="charts"></div>';
    }

    renderUserList() {
        const container = document.getElementById('user-list');
        container.innerHTML = this.users.map(user => `
            <div class="user-card" data-user-id="${user.id}">
                <img src="${user.avatar}" alt="${user.name}">
                <h3>${user.name}</h3>
                <p>${user.email}</p>
            </div>
        `).join('');
    }

    renderCharts() {
        // Simulate chart rendering
        console.log('Rendering charts...', this.analytics);
    }

    renderFooter() {
        const footer = document.getElementById('footer');
        footer.innerHTML = '<p>&copy; 2025 Company Name</p>';
    }

    showUserDetails(userId) {
        const user = this.users.find(u => u.id === userId);
        if (user) {
            console.log('Showing details for:', user);
        }
    }

    filterUsers(query) {
        const filtered = this.users.filter(user =>
            user.name.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query)
        );
        this.users = filtered;
        this.renderUserList();
    }

    applyFilter(filterValue) {
        console.log('Applying filter:', filterValue);
    }

    applySettings() {
        console.log('Applying settings:', this.settings);
    }

    // Additional utility methods
    formatDate(date) {
        return new Date(date).toLocaleDateString();
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    validateEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new UserDashboard();
    dashboard.initializeDashboard();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserDashboard;
}
