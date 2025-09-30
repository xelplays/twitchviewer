class ClipDashboard {
    constructor() {
        this.baseUrl = window.location.origin;
        this.adminKey = this.getAdminKey();
        this.clips = [];
        this.currentClip = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadClips();
        this.setupAutoRefresh();
    }
    
    getAdminKey() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('admin_key') || '';
    }
    
    setupEventListeners() {
        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadClips();
        });
        
        // Sort select
        document.getElementById('sortSelect').addEventListener('change', (e) => {
            this.sortClips(e.target.value);
        });
        
        // Modal close buttons
        document.getElementById('approvalModalClose').addEventListener('click', () => {
            this.closeModal('approvalModal');
        });
        
        document.getElementById('rejectionModalClose').addEventListener('click', () => {
            this.closeModal('rejectionModal');
        });
        
        // Modal cancel buttons
        document.getElementById('approvalCancel').addEventListener('click', () => {
            this.closeModal('approvalModal');
        });
        
        document.getElementById('rejectionCancel').addEventListener('click', () => {
            this.closeModal('rejectionModal');
        });
        
        // Form submissions
        document.getElementById('approvalForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.approveClip();
        });
        
        document.getElementById('rejectionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.rejectClip();
        });
        
        // Click outside modal to close
        document.getElementById('approvalModal').addEventListener('click', (e) => {
            if (e.target.id === 'approvalModal') {
                this.closeModal('approvalModal');
            }
        });
        
        document.getElementById('rejectionModal').addEventListener('click', (e) => {
            if (e.target.id === 'rejectionModal') {
                this.closeModal('rejectionModal');
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }
    
    async loadClips() {
        try {
            this.showLoading(true);
            
            const response = await fetch(`${this.baseUrl}/api/clips/pending`, {
                headers: {
                    'x-admin-key': this.adminKey
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.clips = data.pending || [];
            this.renderClips();
            this.updateStats();
            
        } catch (error) {
            console.error('Error loading clips:', error);
            this.showError('Failed to load clips');
            this.showLoading(false);
        }
    }
    
    renderClips() {
        const container = document.getElementById('clipsContainer');
        const noClips = document.getElementById('noClips');
        
        if (this.clips.length === 0) {
            container.style.display = 'none';
            noClips.style.display = 'block';
            return;
        }
        
        container.style.display = 'block';
        noClips.style.display = 'none';
        
        container.innerHTML = this.clips.map(clip => this.createClipCard(clip)).join('');
        
        // Add event listeners to action buttons
        container.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const clipId = parseInt(e.target.dataset.clipId);
                this.openApprovalModal(clipId);
            });
        });
        
        container.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const clipId = parseInt(e.target.dataset.clipId);
                this.openRejectionModal(clipId);
            });
        });
    }
    
    createClipCard(clip) {
        const submitTime = new Date(clip.submitted_at * 1000);
        const timeAgo = this.formatTimeAgo(submitTime);
        
        return `
            <div class="clip-card">
                <div class="clip-header">
                    <div class="clip-info">
                        <h3>Clip Submission #${clip.id}</h3>
                        <div class="clip-submitter">@${clip.display_name || clip.submitter}</div>
                        <div class="clip-time">Submitted ${timeAgo}</div>
                    </div>
                </div>
                
                <div class="clip-url">
                    <a href="${clip.clip_url}" target="_blank" rel="noopener noreferrer">
                        <i class="fas fa-external-link-alt"></i> ${clip.clip_url}
                    </a>
                </div>
                
                <div class="clip-actions">
                    <button class="btn btn-danger btn-reject" data-clip-id="${clip.id}">
                        <i class="fas fa-times"></i> Reject
                    </button>
                    <button class="btn btn-success btn-approve" data-clip-id="${clip.id}">
                        <i class="fas fa-check"></i> Approve
                    </button>
                </div>
            </div>
        `;
    }
    
    openApprovalModal(clipId) {
        const clip = this.clips.find(c => c.id === clipId);
        if (!clip) return;
        
        this.currentClip = clip;
        
        // Update modal content
        document.getElementById('approvalClipPreview').innerHTML = `
            <h4>Clip #${clip.id}</h4>
            <p><strong>Submitter:</strong> @${clip.display_name || clip.submitter}</p>
            <p><strong>URL:</strong> <a href="${clip.clip_url}" target="_blank">${clip.clip_url}</a></p>
            <p><strong>Submitted:</strong> ${new Date(clip.submitted_at * 1000).toLocaleString()}</p>
        `;
        
        // Reset form
        document.getElementById('approvalPoints').value = 10;
        document.getElementById('approvalNote').value = '';
        
        this.showModal('approvalModal');
    }
    
    openRejectionModal(clipId) {
        const clip = this.clips.find(c => c.id === clipId);
        if (!clip) return;
        
        this.currentClip = clip;
        
        // Update modal content
        document.getElementById('rejectionClipPreview').innerHTML = `
            <h4>Clip #${clip.id}</h4>
            <p><strong>Submitter:</strong> @${clip.display_name || clip.submitter}</p>
            <p><strong>URL:</strong> <a href="${clip.clip_url}" target="_blank">${clip.clip_url}</a></p>
            <p><strong>Submitted:</strong> ${new Date(clip.submitted_at * 1000).toLocaleString()}</p>
        `;
        
        // Reset form
        document.getElementById('rejectionNote').value = '';
        
        this.showModal('rejectionModal');
    }
    
    async approveClip() {
        if (!this.currentClip) return;
        
        const points = parseInt(document.getElementById('approvalPoints').value);
        const note = document.getElementById('approvalNote').value;
        
        try {
            const response = await fetch(`${this.baseUrl}/api/clips/${this.currentClip.id}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-key': this.adminKey
                },
                body: JSON.stringify({ points, note })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            this.closeModal('approvalModal');
            this.showToast('success', `Clip approved! ${points} points awarded.`);
            this.loadClips(); // Refresh the list
            
        } catch (error) {
            console.error('Error approving clip:', error);
            this.showToast('error', 'Failed to approve clip');
        }
    }
    
    async rejectClip() {
        if (!this.currentClip) return;
        
        const note = document.getElementById('rejectionNote').value;
        
        if (!note.trim()) {
            this.showToast('error', 'Please provide a reason for rejection');
            return;
        }
        
        try {
            const response = await fetch(`${this.baseUrl}/api/clips/${this.currentClip.id}/reject`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-key': this.adminKey
                },
                body: JSON.stringify({ note })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.closeModal('rejectionModal');
            this.showToast('success', 'Clip rejected successfully');
            this.loadClips(); // Refresh the list
            
        } catch (error) {
            console.error('Error rejecting clip:', error);
            this.showToast('error', 'Failed to reject clip');
        }
    }
    
    sortClips(sortBy) {
        switch (sortBy) {
            case 'newest':
                this.clips.sort((a, b) => b.submitted_at - a.submitted_at);
                break;
            case 'oldest':
                this.clips.sort((a, b) => a.submitted_at - b.submitted_at);
                break;
            case 'subscriber':
                // For now, just sort by username alphabetically
                // In a real implementation, you might want to check subscriber status
                this.clips.sort((a, b) => (a.display_name || a.submitter).localeCompare(b.display_name || b.submitter));
                break;
        }
        this.renderClips();
    }
    
    updateStats() {
        // In a real implementation, you might want to fetch these from the API
        // For now, we'll calculate from current pending clips
        const pending = this.clips.length;
        const approved = 0; // Would need separate API call
        const rejected = 0; // Would need separate API call
        
        document.getElementById('pendingCount').textContent = pending;
        document.getElementById('approvedCount').textContent = approved;
        document.getElementById('rejectedCount').textContent = rejected;
    }
    
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        this.currentClip = null;
    }
    
    closeAllModals() {
        this.closeModal('approvalModal');
        this.closeModal('rejectionModal');
    }
    
    showLoading(show) {
        const container = document.getElementById('clipsContainer');
        const loadingState = container.querySelector('.loading-state');
        
        if (show) {
            container.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>Loading clips...</span>
                </div>
            `;
        }
    }
    
    showError(message) {
        const container = document.getElementById('clipsContainer');
        container.innerHTML = `
            <div class="loading-state" style="color: #f56565;">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${message}</span>
            </div>
        `;
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
    
    formatTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) {
            return 'just now';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        }
    }
    
    setupAutoRefresh() {
        // Refresh every 30 seconds
        setInterval(() => {
            this.loadClips();
        }, 30000);
    }
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ClipDashboard();
});

// Export for potential external use
window.ClipDashboard = ClipDashboard;
