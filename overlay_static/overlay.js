class TwitchLeaderboardOverlay {
    constructor() {
        this.apiUrl = window.location.origin + '/top10';
        this.refreshInterval = 5000; // 5 seconds
        this.lastData = null;
        this.animationTimeout = null;
        
        this.init();
    }
    
    init() {
        this.loadData();
        this.setupRefreshTimer();
        this.setupErrorHandling();
    }
    
    async loadData() {
        try {
            this.showRefreshIndicator(true);
            
            const response = await fetch(this.apiUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.updateDisplay(data);
            this.lastData = data;
            
        } catch (error) {
            console.error('Error loading leaderboard data:', error);
            this.showError('Failed to load leaderboard data');
        } finally {
            this.showRefreshIndicator(false);
        }
    }
    
    updateDisplay(data) {
        const leaderboardElement = document.getElementById('leaderboard');
        const lastUpdatedElement = document.getElementById('lastUpdated');
        
        // Update last updated time
        if (data.generated_at) {
            const updateTime = new Date(data.generated_at);
            lastUpdatedElement.textContent = `Updated: ${updateTime.toLocaleTimeString()}`;
        }
        
        // Clear current content
        leaderboardElement.innerHTML = '';
        
        if (!data.top || data.top.length === 0) {
            leaderboardElement.innerHTML = '<div class="loading">No data available</div>';
            return;
        }
        
        // Create leaderboard items
        data.top.forEach((user, index) => {
            const item = this.createLeaderboardItem(user, index + 1);
            leaderboardElement.appendChild(item);
            
            // Add animation for new or changed entries
            if (this.shouldAnimateEntry(user, index + 1)) {
                item.classList.add('new-entry');
                setTimeout(() => item.classList.remove('new-entry'), 500);
            }
        });
        
        // Add empty slots if less than 10 entries
        const emptySlots = Math.max(0, 10 - data.top.length);
        for (let i = 0; i < emptySlots; i++) {
            const emptyItem = document.createElement('div');
            emptyItem.className = 'leaderboard-item empty-slot';
            emptyItem.innerHTML = `
                <div class="rank">${data.top.length + i + 1}</div>
                <div class="user-info">
                    <div class="username">---</div>
                    <div class="display-name">---</div>
                </div>
                <div class="points">0</div>
            `;
            emptyItem.style.opacity = '0.5';
            leaderboardElement.appendChild(emptyItem);
        }
    }
    
    createLeaderboardItem(user, rank) {
        const item = document.createElement('div');
        item.className = `leaderboard-item rank-${Math.min(rank, 3)}`;
        
        // Format username and display name
        const username = user.username || 'Unknown';
        const displayName = user.display_name || username;
        const points = user.points || 0;
        
        // Truncate long names
        const truncatedUsername = username.length > 15 ? username.substring(0, 12) + '...' : username;
        const truncatedDisplayName = displayName.length > 20 ? displayName.substring(0, 17) + '...' : displayName;
        
        item.innerHTML = `
            <div class="rank">${rank}</div>
            <div class="user-info">
                <div class="username">${this.escapeHtml(truncatedUsername)}</div>
                <div class="display-name">${this.escapeHtml(truncatedDisplayName)}</div>
            </div>
            <div class="points">${this.formatPoints(points)}</div>
        `;
        
        return item;
    }
    
    shouldAnimateEntry(user, rank) {
        if (!this.lastData || !this.lastData.top) {
            return false;
        }
        
        // Find user in previous data
        const previousEntry = this.lastData.top.find(u => u.username === user.username);
        
        if (!previousEntry) {
            // New user in top 10
            return true;
        }
        
        // Check if rank changed significantly (more than 2 positions)
        const previousRank = this.lastData.top.findIndex(u => u.username === user.username) + 1;
        if (Math.abs(rank - previousRank) >= 2) {
            return true;
        }
        
        // Check if points increased significantly (more than 10%)
        const pointsIncrease = user.points - previousEntry.points;
        if (pointsIncrease > 0 && pointsIncrease > previousEntry.points * 0.1) {
            return true;
        }
        
        return false;
    }
    
    formatPoints(points) {
        if (points >= 1000000) {
            return (points / 1000000).toFixed(1) + 'M';
        } else if (points >= 1000) {
            return (points / 1000).toFixed(1) + 'K';
        }
        return points.toString();
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showRefreshIndicator(updating) {
        const indicator = document.getElementById('refreshIndicator');
        if (updating) {
            indicator.classList.add('updating');
            indicator.textContent = 'Updating...';
        } else {
            indicator.classList.remove('updating');
            indicator.textContent = 'Auto-refresh: 5s';
        }
    }
    
    showError(message) {
        const leaderboardElement = document.getElementById('leaderboard');
        leaderboardElement.innerHTML = `
            <div class="loading" style="color: #ff6b6b;">
                ⚠️ ${message}
            </div>
        `;
    }
    
    setupRefreshTimer() {
        setInterval(() => {
            this.loadData();
        }, this.refreshInterval);
    }
    
    setupErrorHandling() {
        // Handle network errors
        window.addEventListener('online', () => {
            console.log('Network connection restored');
            this.loadData();
        });
        
        window.addEventListener('offline', () => {
            console.log('Network connection lost');
            this.showError('Connection lost');
        });
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Page became visible, refresh data
                this.loadData();
            }
        });
    }
}

// Initialize the overlay when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new TwitchLeaderboardOverlay();
});

// Export for potential external use
window.TwitchLeaderboardOverlay = TwitchLeaderboardOverlay;
