// Dashboard JavaScript
class TwitchDashboard {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.selectedUsers = [];
        this.init();
    }
    
    async init() {
        try {
            await this.checkAuth();
            this.setupEventListeners();
            await this.loadUserData();
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            this.showLogin();
        }
    }
    
    async checkAuth() {
        try {
            const response = await fetch('/api/user/me');
            if (response.ok) {
                this.currentUser = await response.json();
                this.isAdmin = this.currentUser.isAdmin;
                this.showDashboard();
            } else {
                this.showLogin();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showLogin();
        }
    }
    
    setupEventListeners() {
        // Navigation tabs
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });
        
        // Admin tab visibility
        if (this.isAdmin) {
            document.getElementById('adminTab').style.display = 'block';
        }
    }
    
    async loadUserData() {
        if (!this.currentUser) return;
        
        // Load user stats
        await this.loadUserStats();
        
        // Load leaderboard
        await this.loadLeaderboard();
        
        // Load winners
        await this.loadWinners();
        
        // Update user display
        document.getElementById('userDisplayName').textContent = this.currentUser.displayName;
    }
    
    async loadUserStats() {
        try {
            const response = await fetch('/api/user/stats');
            if (response.ok) {
                const stats = await response.json();
                
                document.getElementById('userPoints').textContent = stats.points.toLocaleString();
                document.getElementById('userViewtime').textContent = this.formatViewtime(stats.view_seconds);
                document.getElementById('userMessages').textContent = stats.message_count.toLocaleString();
                
                // Load rank from leaderboard
                await this.loadUserRank();
            }
        } catch (error) {
            console.error('Error loading user stats:', error);
        }
    }
    
    async loadUserRank() {
        try {
            const response = await fetch('/api/leaderboard');
            if (response.ok) {
                const data = await response.json();
                const userRank = data.top.findIndex(user => 
                    user.username.toLowerCase() === this.currentUser.username.toLowerCase()
                );
                
                if (userRank !== -1) {
                    document.getElementById('userRank').textContent = `#${userRank + 1}`;
                } else {
                    document.getElementById('userRank').textContent = '#-';
                }
            }
        } catch (error) {
            console.error('Error loading user rank:', error);
        }
    }
    
    async loadLeaderboard() {
        try {
            const response = await fetch('/api/leaderboard');
            if (response.ok) {
                const data = await response.json();
                this.renderLeaderboard(data);
                
                const updateTime = new Date(data.generated_at);
                document.getElementById('leaderboardUpdated').textContent = 
                    `Aktualisiert: ${updateTime.toLocaleTimeString()}`;
            }
        } catch (error) {
            console.error('Error loading leaderboard:', error);
        }
    }
    
    renderLeaderboard(data) {
        const container = document.getElementById('leaderboardList');
        
        if (!data.top || data.top.length === 0) {
            container.innerHTML = '<div class="loading">Keine Daten verfügbar</div>';
            return;
        }
        
        container.innerHTML = data.top.map((user, index) => {
            const isCurrentUser = user.username.toLowerCase() === this.currentUser.username.toLowerCase();
            const rankClass = index < 3 ? `rank-${index + 1}` : '';
            const highlightClass = isCurrentUser ? 'current-user' : '';
            
            return `
                <div class="leaderboard-item ${rankClass} ${highlightClass}">
                    <div class="rank">${index + 1}</div>
                    <div class="user-info">
                        <div class="username">${user.display_name || user.username}</div>
                        <div class="display-name">@${user.username}</div>
                    </div>
                    <div class="points">${user.points.toLocaleString()}</div>
                </div>
            `;
        }).join('');
    }
    
    async loadWinners() {
        try {
            const response = await fetch('/api/winners');
            if (response.ok) {
                const winners = await response.json();
                this.renderWinners(winners);
            }
        } catch (error) {
            console.error('Error loading winners:', error);
        }
    }
    
    renderWinners(winners) {
        const container = document.getElementById('winnersList');
        
        if (!winners || winners.length === 0) {
            container.innerHTML = '<div class="loading">Keine Monats-Sieger verfügbar</div>';
            return;
        }
        
        // Group winners by month
        const winnersByMonth = {};
        winners.forEach(winner => {
            if (!winnersByMonth[winner.month]) {
                winnersByMonth[winner.month] = [];
            }
            winnersByMonth[winner.month].push(winner);
        });
        
        container.innerHTML = Object.keys(winnersByMonth)
            .sort((a, b) => b.localeCompare(a))
            .map(month => {
                const monthWinners = winnersByMonth[month].sort((a, b) => a.rank - b.rank);
                
                return `
                    <div class="winner-month-group">
                        <h4>${month}</h4>
                        ${monthWinners.map(winner => `
                            <div class="winner-item">
                                <div class="winner-rank rank-${winner.rank}">${winner.rank}</div>
                                <div class="winner-info">
                                    <div class="winner-name">${winner.display_name || winner.username}</div>
                                    <div class="winner-points">${winner.points.toLocaleString()} Punkte</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }).join('');
    }
    
    // Admin Functions
    async loadAllUsers() {
        if (!this.isAdmin) return;
        
        try {
            const response = await fetch('/api/admin/users');
            if (response.ok) {
                const users = await response.json();
                this.renderAllUsers(users);
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.showToast('error', 'Fehler beim Laden der User');
        }
    }
    
    renderAllUsers(users) {
        const container = document.getElementById('allUsersList');
        container.style.display = 'block';
        
        container.innerHTML = `
            <h4>Alle User (Top 100)</h4>
            <div class="users-grid">
                ${users.map(user => `
                    <div class="user-item">
                        <strong>${user.display_name || user.username}</strong>
                        <div class="user-stats">
                            <span>Punkte: ${user.points.toLocaleString()}</span>
                            <span>Nachrichten: ${user.message_count.toLocaleString()}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    async loadUsersForMonthEnd() {
        if (!this.isAdmin) return;
        
        try {
            const response = await fetch('/api/admin/users');
            if (response.ok) {
                const users = await response.json();
                this.renderMonthEndUsers(users.slice(0, 10)); // Top 10
            }
        } catch (error) {
            console.error('Error loading users for month end:', error);
            this.showToast('error', 'Fehler beim Laden der User');
        }
    }
    
    renderMonthEndUsers(users) {
        const container = document.getElementById('monthEndContainer');
        const usersList = document.getElementById('topUsersList');
        
        container.style.display = 'block';
        
        usersList.innerHTML = `
            <div class="month-end-users">
                ${users.map((user, index) => `
                    <div class="user-select-item">
                        <input type="checkbox" 
                               id="user-${index}" 
                               value="${user.username}"
                               data-display-name="${user.display_name || user.username}"
                               data-points="${user.points}">
                        <label for="user-${index}">
                            <strong>${index + 1}. ${user.display_name || user.username}</strong>
                            <span>(${user.points.toLocaleString()} Punkte)</span>
                        </label>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Add event listeners to checkboxes
        usersList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateSelectedUsers();
            });
        });
    }
    
    updateSelectedUsers() {
        const checkboxes = document.querySelectorAll('#topUsersList input[type="checkbox"]:checked');
        this.selectedUsers = Array.from(checkboxes).map(cb => ({
            username: cb.value,
            display_name: cb.dataset.displayName,
            points: parseInt(cb.dataset.points)
        }));
    }
    
    async givePoints() {
        if (!this.isAdmin) return;
        
        const username = document.getElementById('giveUsername').value.trim();
        const points = parseInt(document.getElementById('givePoints').value);
        const reason = document.getElementById('giveReason').value.trim();
        
        if (!username || !points || points <= 0) {
            this.showToast('error', 'Bitte fülle alle Felder korrekt aus');
            return;
        }
        
        try {
            const response = await fetch('/api/admin/give-points', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    points: points,
                    reason: reason || 'admin-give'
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showToast('success', `${points} Punkte an @${username} vergeben! Neue Gesamtsumme: ${result.newTotal}`);
                
                // Clear form
                document.getElementById('giveUsername').value = '';
                document.getElementById('givePoints').value = '';
                document.getElementById('giveReason').value = '';
                
                // Reload data
                await this.loadUserStats();
                await this.loadLeaderboard();
            } else {
                const error = await response.json();
                this.showToast('error', error.error || 'Fehler beim Vergeben der Punkte');
            }
        } catch (error) {
            console.error('Error giving points:', error);
            this.showToast('error', 'Fehler beim Vergeben der Punkte');
        }
    }
    
    async endMonth() {
        if (!this.isAdmin || this.selectedUsers.length === 0) {
            this.showToast('error', 'Bitte wähle mindestens einen Gewinner aus');
            return;
        }
        
        if (!confirm(`Möchtest du den Monat wirklich beenden mit ${this.selectedUsers.length} Gewinnern?`)) {
            return;
        }
        
        try {
            const response = await fetch('/api/admin/end-month', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    winners: this.selectedUsers
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showToast('success', `Monat erfolgreich beendet! ${result.winners} Gewinner ausgewählt.`);
                
                // Hide month end container
                document.getElementById('monthEndContainer').style.display = 'none';
                
                // Reload data
                await this.loadWinners();
                await this.loadUserStats();
                await this.loadLeaderboard();
            } else {
                const error = await response.json();
                this.showToast('error', error.error || 'Fehler beim Beenden des Monats');
            }
        } catch (error) {
            console.error('Error ending month:', error);
            this.showToast('error', 'Fehler beim Beenden des Monats');
        }
    }
    
    // Utility Functions
    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }
    
    showLogin() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('login').style.display = 'block';
    }
    
    showDashboard() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('login').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
    }
    
    formatViewtime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
    
    showToast(type, message) {
        const toast = document.getElementById('toast');
        const icon = toast.querySelector('.toast-icon');
        const messageEl = toast.querySelector('.toast-message');
        
        toast.className = `toast ${type}`;
        icon.className = `toast-icon fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`;
        messageEl.textContent = message;
        
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Global functions for HTML onclick handlers
function logout() {
    window.location.href = '/auth/logout';
}

function loadLeaderboard() {
    window.dashboard.loadLeaderboard();
}

function givePoints() {
    window.dashboard.givePoints();
}

function loadUsersForMonthEnd() {
    window.dashboard.loadUsersForMonthEnd();
}

function loadAllUsers() {
    window.dashboard.loadAllUsers();
}

function endMonth() {
    window.dashboard.endMonth();
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new TwitchDashboard();
});
