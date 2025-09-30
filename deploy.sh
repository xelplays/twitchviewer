#!/bin/bash

# 🚀 Twitch Activity Bot - VPS Deployment Script
# Usage: bash deploy.sh

set -e  # Exit on any error

echo "🚀 Starting Twitch Activity Bot Deployment..."
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_warning "Running as root. Consider using a non-root user for better security."
fi

# Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
print_status "Installing required packages..."
sudo apt install -y curl wget git nano htop sqlite3

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_status "Node.js not found. Installing Node.js 20.x..."
    
    # Install Node.js via NodeSource
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    print_success "Node.js installed successfully"
else
    NODE_VERSION=$(node --version)
    print_success "Node.js already installed: $NODE_VERSION"
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    print_error "npm not found. Please install npm."
    exit 1
fi

NPM_VERSION=$(npm --version)
print_success "npm version: $NPM_VERSION"

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2..."
    sudo npm install -g pm2
    print_success "PM2 installed successfully"
else
    print_success "PM2 already installed"
fi

# Install Nginx
if ! command -v nginx &> /dev/null; then
    print_status "Installing Nginx..."
    sudo apt install -y nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
    print_success "Nginx installed and started"
else
    print_success "Nginx already installed"
fi

# Configure firewall
print_status "Configuring UFW firewall..."
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000
print_success "Firewall configured"

# Clone or update repository
REPO_DIR="/opt/twitchviewer"
if [ -d "$REPO_DIR" ]; then
    print_status "Repository exists. Updating..."
    cd "$REPO_DIR"
    git pull origin main
else
    print_status "Cloning repository..."
    sudo mkdir -p /opt
    sudo git clone https://github.com/xelplays/twitchviewer.git "$REPO_DIR"
    sudo chown -R $USER:$USER "$REPO_DIR"
    cd "$REPO_DIR"
fi

# Install dependencies
print_status "Installing Node.js dependencies..."
npm install

# Create logs directory
mkdir -p logs

# Check if .env exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from template..."
    cp env.example .env
    print_warning "Please edit .env file with your configuration:"
    print_warning "nano .env"
    print_warning "Required: BOT_USERNAME, BOT_OAUTH, CHANNEL, ADMIN_KEY"
    echo ""
    read -p "Press Enter after you have configured .env file..."
fi

# Initialize database
print_status "Initializing database..."
npm run init-db

# Stop existing PM2 process if running
if pm2 list | grep -q "twitch-bot"; then
    print_status "Stopping existing bot process..."
    pm2 stop twitch-bot
    pm2 delete twitch-bot
fi

# Start bot with PM2
print_status "Starting bot with PM2..."
pm2 start ecosystem.config.js
pm2 save

# Setup PM2 startup
print_status "Setting up PM2 startup..."
pm2 startup

print_success "Bot started successfully!"

# Configure Nginx
print_status "Configuring Nginx reverse proxy..."
NGINX_CONFIG="/etc/nginx/sites-available/twitch-bot"

sudo tee "$NGINX_CONFIG" > /dev/null <<EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
sudo ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
sudo nginx -t && sudo systemctl reload nginx

print_success "Nginx configured successfully!"

# Create backup script
print_status "Creating backup script..."
sudo tee backup.sh > /dev/null <<'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
SOURCE_DB="/opt/twitchviewer/activity.db"

mkdir -p $BACKUP_DIR
if [ -f "$SOURCE_DB" ]; then
    cp $SOURCE_DB $BACKUP_DIR/activity_backup_$DATE.db
    echo "Backup created: activity_backup_$DATE.db"
    
    # Clean old backups (older than 30 days)
    find $BACKUP_DIR -name "activity_backup_*.db" -mtime +30 -delete
else
    echo "Database file not found: $SOURCE_DB"
fi
EOF

chmod +x backup.sh

# Display status
echo ""
echo "=============================================="
print_success "Deployment completed successfully!"
echo "=============================================="
echo ""
echo "📊 Bot Status:"
pm2 status
echo ""
echo "🌐 URLs:"
echo "  - Overlay: http://$(curl -s ifconfig.me)/overlay.html"
echo "  - Admin Dashboard: http://$(curl -s ifconfig.me)/admin/clips.html?admin_key=YOUR_KEY"
echo "  - API: http://$(curl -s ifconfig.me)/top10"
echo ""
echo "📝 Useful Commands:"
echo "  - View logs: pm2 logs twitch-bot"
echo "  - Restart bot: pm2 restart twitch-bot"
echo "  - Stop bot: pm2 stop twitch-bot"
echo "  - Monitor: pm2 monit"
echo "  - Backup: ./backup.sh"
echo ""
echo "🔧 Configuration:"
echo "  - Edit config: nano /opt/twitchviewer/.env"
echo "  - View Nginx logs: sudo tail -f /var/log/nginx/error.log"
echo "  - System resources: htop"
echo ""
print_warning "Don't forget to configure your .env file with your Twitch credentials!"
echo ""
