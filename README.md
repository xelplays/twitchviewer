# Twitch Activity Leaderboard Bot

Ein Node.js Bot für Twitch mit Viewtime-Tracking, Chat-Punkten, Clip-Submissions und einem Admin-Dashboard. Features ein OBS-Overlay für die Top 10 Leaderboard und einen Web-Dashboard für Clip-Reviews.

## 🚀 Features

- **Viewtime Tracking**: Automatische Punktevergabe basierend auf Zuschauerzeit
- **Chat Points**: Punkte für aktive Chat-Teilnahme mit Anti-Spam-Schutz
- **Clip Submissions**: User können Clips einreichen, Mods können approve/reject
- **OBS Overlay**: Live-Top10 Leaderboard für Streams
- **Admin Dashboard**: Web-Interface für Clip-Management
- **Monthly Winners**: Automatische Top-2 Auswertung am Monatsende
- **Anti-Cheat**: Logging verdächtiger Aktivitäten
- **REST API**: Vollständige API für externe Integration

## 📋 Voraussetzungen

- Node.js 18+
- Twitch Account mit Bot-Username
- Twitch OAuth Token (chat:read, chat:edit)
- SQLite3 (wird automatisch installiert)

## 🛠️ Installation

### 1. Repository klonen/herunterladen

```bash
git clone <repository-url>
cd twitch-activity-leaderboard
```

### 2. Abhängigkeiten installieren

```bash
npm install
```

### 3. Umgebungsvariablen konfigurieren

```bash
# Kopiere die Beispiel-Konfiguration
cp env.example .env

# Bearbeite .env mit deinen Werten
nano .env
```

### 4. Datenbank initialisieren

```bash
npm run init-db
```

### 5. Bot starten

```bash
npm start
```

## ⚙️ Konfiguration (.env)

```env
# Twitch Bot Configuration
BOT_USERNAME=dein_bot_username
BOT_OAUTH=oauth:xxxxxxxxxxxxxxxxxxxx
CHANNEL=dein_channel_name

# Admin Configuration
ADMIN_KEY=DeinSehrGeheimerAdminKey123

# Server Configuration
EXPRESS_PORT=3000
TIMEZONE=Europe/Berlin

# Optional: Twitch API für Clip-Validierung
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
ENABLE_EVENTSUB=false

# Bot Behavior (optional)
HEARTBEAT_SECONDS=60
PRESENCE_TIMEOUT_SECONDS=120
VIEWTIME_SECONDS_PER_POINT=60
POINTS_PER_MESSAGE=1
MIN_SECONDS_BETWEEN_CHAT_POINTS=30
MAX_CHAT_POINTS_PER_HOUR=10
MAX_CLIPS_PER_DAY=3
```

### Twitch OAuth Token erhalten

1. Gehe zu [Twitch Token Generator](https://twitchtokengenerator.com/)
2. Wähle Scopes: `chat:read`, `chat:edit`
3. Kopiere den generierten Token (beginnt mit `oauth:`)

## 🎮 Chat Commands

### User Commands
- `!punkte` / `!points` - Zeige deine aktuellen Punkte
- `!top` / `!leaderboard` - Zeige Top 5 im Chat
- `!submitclip <url>` - Reiche einen Clip zur Bewertung ein

### Moderator Commands
- `!clips pending` - Liste ausstehende Clip-Submissions
- `!clipapprove <id> <points> [note]` - Approve Clip und vergebe Punkte
- `!clipreject <id> [note]` - Reject Clip mit Begründung
- `!give <user> <amount>` - Vergebe Punkte an User
- `!dropall <amount>` - Vergebe Punkte an alle aktiven User
- `!droprandom <amount> <count>` - Vergebe Punkte an zufällige User

## 🌐 API Endpoints

### Public Endpoints

#### GET /top10
Gibt die Top 10 User mit ihren Punkten zurück.

```bash
curl http://localhost:3000/top10
```

Response:
```json
{
  "generated_at": 1698765432000,
  "top": [
    {
      "rank": 1,
      "username": "user1",
      "display_name": "User1",
      "points": 1250
    }
  ]
}
```

### Admin Endpoints (Header: x-admin-key oder Query: admin_key)

#### GET /api/clips/pending
Listet alle ausstehenden Clip-Submissions.

```bash
curl -H "x-admin-key: DeinAdminKey" http://localhost:3000/api/clips/pending
```

#### POST /api/clips/:id/approve
Approve einen Clip und vergebe Punkte.

```bash
curl -X POST "http://localhost:3000/api/clips/1/approve" \
  -H "x-admin-key: DeinAdminKey" \
  -H "Content-Type: application/json" \
  -d '{"points": 10, "note": "Great highlight!"}'
```

#### POST /api/clips/:id/reject
Reject einen Clip.

```bash
curl -X POST "http://localhost:3000/api/clips/1/reject" \
  -H "x-admin-key: DeinAdminKey" \
  -H "Content-Type: application/json" \
  -d '{"note": "Not suitable for highlights"}'
```

## 🎨 OBS Overlay Setup

1. **Browser Source hinzufügen**:
   - URL: `http://localhost:3000/overlay.html`
   - Breite: 450px
   - Höhe: 600px
   - Transparenz: Aktiviert

2. **Anpassungen**:
   - CSS kann in `overlay_static/overlay.css` angepasst werden
   - Auto-Refresh alle 5 Sekunden
   - Responsive Design für verschiedene Auflösungen

## 🔧 Admin Dashboard

### Zugriff
```
http://localhost:3000/admin/clips.html?admin_key=DeinAdminKey
```

### Features
- Übersicht aller ausstehenden Clips
- Ein-Klick Approve/Reject mit Punktevergabe
- Notizen für Reviews
- Auto-Refresh alle 30 Sekunden
- Responsive Design

## 📊 Datenbank Schema

### points Tabelle
- `username`: Twitch Username (lowercase)
- `display_name`: Anzeigename
- `points`: Aktuelle Punkte
- `view_seconds`: Gesamte Zuschauerzeit
- `last_message_ts`: Letzte Chat-Nachricht
- `last_seen_ts`: Letzte Aktivität
- `chat_points_last_hour`: Chat-Punkte diese Stunde
- `message_count`: Anzahl Nachrichten

### clips Tabelle
- `submitter`: Username des Einreichers
- `clip_url`: URL des Clips
- `status`: pending/approved/rejected
- `points_awarded`: Vergebene Punkte
- `reviewer`: Wer hat reviewed
- `submitted_at`: Einreichungszeit
- `reviewed_at`: Review-Zeit

### winners Tabelle
- `month`: Monat (YYYY-MM)
- `rank`: Platzierung (1-2)
- `username`: Gewinner
- `points`: Punkte zum Monatsende

## 🔄 Cron Jobs

### Monthly Winner Job
- **Zeit**: 1. des Monats um 00:00 (Server-Zeit)
- **Aktion**: 
  - Top 2 User ermitteln
  - In winners Tabelle speichern
  - Im Chat ankündigen
  - Punkte zurücksetzen

## 🛡️ Sicherheit & Anti-Cheat

### Implementierte Maßnahmen
- **Rate Limiting**: Max Chat-Punkte pro Stunde
- **Cooldown**: Mindestabstand zwischen Chat-Punkten
- **Suspicious Activity Logging**: Große Punkt-Sprünge werden geloggt
- **Admin Authentication**: Alle Admin-Endpoints geschützt
- **Input Validation**: URL-Validierung für Clips

### Monitoring
- Verdächtige Aktivitäten werden in der Konsole geloggt
- Große Punkt-Sprünge (>50) werden automatisch erfasst
- Admin-Dashboard zeigt alle Aktionen an

## 🚀 Deployment

### Lokale Entwicklung
```bash
npm run dev
```

### Produktion mit PM2
```bash
# PM2 installieren
npm install -g pm2

# Bot starten
pm2 start bot_overlay.js --name "twitch-bot"

# Auto-restart bei Neustart
pm2 startup
pm2 save
```

### Produktion mit systemd
```bash
# Service-Datei erstellen
sudo nano /etc/systemd/system/twitch-bot.service

[Unit]
Description=Twitch Activity Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/twitch-activity-leaderboard
ExecStart=/usr/bin/node bot_overlay.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target

# Service aktivieren
sudo systemctl enable twitch-bot
sudo systemctl start twitch-bot
```

## 🔧 Erweiterte Konfiguration

### Twitch API Integration (Optional)
Für automatische Clip-Validierung:

1. Twitch Developer App erstellen
2. Client ID und Secret in .env setzen
3. `ENABLE_EVENTSUB=true` setzen

```env
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
ENABLE_EVENTSUB=true
```

### Reverse Proxy (nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🧪 Testing

### Test-Commands
```bash
# Top 10 API testen
curl http://localhost:3000/top10

# Clip submission simulieren
curl -X POST "http://localhost:3000/api/test/submitclip" \
  -H "Content-Type: application/json" \
  -d '{"submitter":"testuser","display_name":"TestUser","clip_url":"https://clips.twitch.tv/TestClip"}'

# Admin authentication testen
curl -H "x-admin-key: DeinAdminKey" http://localhost:3000/api/clips/pending
```

### Chat-Tests
1. Bot in Twitch Chat einladen
2. Commands testen: `!punkte`, `!top`
3. Clip submission testen: `!submitclip https://clips.twitch.tv/...`
4. Admin commands testen (als Mod)

## 📝 Logs & Debugging

### Log-Levels
- **Info**: Normale Bot-Aktivität
- **Warn**: Verdächtige Aktivitäten
- **Error**: Fehler und API-Probleme

### Debug-Modus
```bash
NODE_ENV=development npm start
```

### Log-Dateien (bei PM2)
```bash
pm2 logs twitch-bot
```

## 🔄 Updates & Wartung

### Datenbank-Backup
```bash
# SQLite Backup
cp activity.db activity_backup_$(date +%Y%m%d).db
```

### Log-Rotation
```bash
# Logs komprimieren und rotieren
logrotate /etc/logrotate.d/twitch-bot
```

## 🆘 Troubleshooting

### Häufige Probleme

**Bot verbindet sich nicht:**
- OAuth Token prüfen
- Username korrekt?
- Scopes ausreichend?

**Overlay lädt nicht:**
- Port erreichbar?
- Firewall-Einstellungen
- Browser-Konsole prüfen

**Database Errors:**
- Berechtigungen prüfen
- Disk-Speicher verfügbar?
- `npm run init-db` erneut ausführen

### Support
Bei Problemen:
1. Logs prüfen
2. .env Konfiguration validieren
3. Dependencies aktualisieren: `npm update`
4. Database neu initialisieren

## 📄 Lizenz

MIT License - siehe LICENSE Datei für Details.

## 🤝 Contributing

1. Fork das Repository
2. Feature Branch erstellen
3. Changes committen
4. Pull Request erstellen

---

**Happy Streaming! 🎮**
