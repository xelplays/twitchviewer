# 🚀 VPS Deployment Guide

Anleitung zum Deployment des Twitch Activity Bots auf einem VPS (Ubuntu/Debian).

## 📋 VPS Voraussetzungen

- **OS**: Ubuntu 20.04+ oder Debian 11+
- **RAM**: Minimum 1GB (empfohlen: 2GB+)
- **CPU**: 1 Core (empfohlen: 2 Cores+)
- **Storage**: 10GB+ freier Speicher
- **Network**: Port 3000 (oder anderen Port) offen

## 🔧 Schritt 1: VPS Setup

### SSH Verbindung
```bash
ssh root@deine-vps-ip
# oder
ssh username@deine-vps-ip
```

### System aktualisieren
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install curl wget git nano htop -y
```

## 📦 Schritt 2: Node.js installieren

### Node.js 20.x installieren
```bash
# NodeSource Repository hinzufügen
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Node.js installieren
sudo apt-get install -y nodejs

# Version prüfen
node --version
npm --version
```

### Alternative: Node.js über nvm installieren
```bash
# nvm installieren
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Shell neu laden
source ~/.bashrc

# Node.js 20 installieren
nvm install 20
nvm use 20
nvm alias default 20
```

## 🗄️ Schritt 3: SQLite installieren

```bash
sudo apt install sqlite3 -y
```

## 📁 Schritt 4: Projekt herunterladen

```bash
# In das gewünschte Verzeichnis wechseln
cd /opt
# oder
cd /home/username

# Repository klonen
git clone https://github.com/xelplays/twitchviewer.git
cd twitchviewer

# Dependencies installieren
npm install
```

## ⚙️ Schritt 5: Konfiguration

### .env Datei erstellen
```bash
cp env.example .env
nano .env
```

### .env Konfiguration anpassen
```env
# Twitch Bot Configuration
BOT_USERNAME=dein_bot_username
BOT_OAUTH=oauth:dein_oauth_token
CHANNEL=dein_channel_name

# Admin Configuration
ADMIN_KEY=dein_sehr_sicherer_admin_key

# Server Configuration
EXPRESS_PORT=3000
TIMEZONE=Europe/Berlin

# Optional: Twitch API
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
ENABLE_EVENTSUB=false

# Bot Behavior
HEARTBEAT_SECONDS=60
PRESENCE_TIMEOUT_SECONDS=120
VIEWTIME_SECONDS_PER_POINT=60
POINTS_PER_MESSAGE=1
MIN_SECONDS_BETWEEN_CHAT_POINTS=30
MAX_CHAT_POINTS_PER_HOUR=10
MAX_CLIPS_PER_DAY=3
```

### Datenbank initialisieren
```bash
npm run init-db
```

## 🔥 Schritt 6: Firewall konfigurieren

```bash
# UFW Firewall aktivieren
sudo ufw enable

# SSH Port erlauben
sudo ufw allow ssh

# HTTP Port erlauben (für Overlay und Admin Dashboard)
sudo ufw allow 3000

# Optional: HTTPS Port erlauben (falls SSL verwendet wird)
sudo ufw allow 443

# Status prüfen
sudo ufw status
```

## 🚀 Schritt 7: PM2 für Production Setup

### PM2 installieren
```bash
sudo npm install -g pm2
```

### PM2 Konfiguration erstellen
```bash
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'twitch-bot',
    script: 'bot_overlay.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

### Logs Verzeichnis erstellen
```bash
mkdir logs
```

### Bot mit PM2 starten
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 🔄 Schritt 8: Auto-Start konfigurieren

```bash
# PM2 Startup Script ausführen (folge den Anweisungen)
pm2 startup

# PM2 Konfiguration speichern
pm2 save
```

## 🌐 Schritt 9: Reverse Proxy mit Nginx (empfohlen)

### Nginx installieren
```bash
sudo apt install nginx -y
```

### Nginx Konfiguration erstellen
```bash
sudo nano /etc/nginx/sites-available/twitch-bot
```

```nginx
server {
    listen 80;
    server_name deine-domain.com;  # oder deine-vps-ip

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Site aktivieren
```bash
sudo ln -s /etc/nginx/sites-available/twitch-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🔒 Schritt 10: SSL mit Let's Encrypt (optional)

### Certbot installieren
```bash
sudo apt install certbot python3-certbot-nginx -y
```

### SSL Zertifikat erstellen
```bash
sudo certbot --nginx -d deine-domain.com
```

## 📊 Schritt 11: Monitoring & Logs

### PM2 Status prüfen
```bash
pm2 status
pm2 logs
pm2 monit
```

### System Ressourcen überwachen
```bash
htop
# oder
top
```

### Logs anzeigen
```bash
# PM2 Logs
pm2 logs twitch-bot

# Nginx Logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# System Logs
sudo journalctl -u nginx -f
```

## 🔧 Schritt 12: Updates & Wartung

### Bot Updates
```bash
cd /opt/twitchviewer  # oder dein Pfad
git pull origin main
npm install
pm2 restart twitch-bot
```

### Datenbank Backup
```bash
# Backup erstellen
cp activity.db activity_backup_$(date +%Y%m%d_%H%M%S).db

# Backup Script erstellen
nano backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
SOURCE_DB="/opt/twitchviewer/activity.db"

mkdir -p $BACKUP_DIR
cp $SOURCE_DB $BACKUP_DIR/activity_backup_$DATE.db

# Alte Backups löschen (älter als 30 Tage)
find $BACKUP_DIR -name "activity_backup_*.db" -mtime +30 -delete

echo "Backup created: activity_backup_$DATE.db"
```

```bash
chmod +x backup.sh
```

### Cron Job für automatische Backups
```bash
crontab -e
```

Füge hinzu:
```bash
# Täglich um 2 Uhr Backup erstellen
0 2 * * * /opt/twitchviewer/backup.sh
```

## 🚨 Troubleshooting

### Bot startet nicht
```bash
# Logs prüfen
pm2 logs twitch-bot

# Manuell testen
node bot_overlay.js

# Dependencies prüfen
npm list
```

### Port bereits belegt
```bash
# Port prüfen
sudo netstat -tulpn | grep :3000

# Prozess beenden
sudo kill -9 PID_NUMMER
```

### Datenbank Probleme
```bash
# Datenbank prüfen
sqlite3 activity.db ".tables"

# Datenbank neu erstellen
rm activity.db
npm run init-db
```

### Nginx Probleme
```bash
# Konfiguration testen
sudo nginx -t

# Logs prüfen
sudo tail -f /var/log/nginx/error.log

# Nginx neu starten
sudo systemctl restart nginx
```

## 📱 URLs nach Deployment

- **Overlay**: `http://deine-domain.com/overlay.html`
- **Admin Dashboard**: `http://deine-domain.com/admin/clips.html?admin_key=DEIN_KEY`
- **API**: `http://deine-domain.com/top10`

## 🔐 Sicherheitshinweise

1. **Starke Passwörter** für Admin Key verwenden
2. **Firewall** konfigurieren
3. **SSH Keys** statt Passwörter verwenden
4. **Regelmäßige Updates** durchführen
5. **Logs überwachen** für verdächtige Aktivitäten
6. **Backups** regelmäßig erstellen

## 📞 Support

Bei Problemen:
1. PM2 Logs prüfen: `pm2 logs`
2. Nginx Logs prüfen: `sudo tail -f /var/log/nginx/error.log`
3. System Ressourcen prüfen: `htop`
4. Bot manuell testen: `node bot_overlay.js`

---

**Viel Erfolg beim Deployment! 🚀**
