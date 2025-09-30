# 🚀 Twitch Extension Setup Guide

## 📋 **Vorbereitung:**

### **1. ZIP Datei erstellen:**
```bash
cd twitch_extension
zip -r leaderboard-extension.zip .
```

### **2. Dateien in der ZIP:**
- ✅ `manifest.json` - Extension Konfiguration
- ✅ `panel.html` - Viewer Panel
- ✅ `config.html` - Broadcaster Config
- ✅ `live_config.html` - Live Controls
- ✅ `assets/icon.svg` - Extension Icon

---

## 🎯 **Twitch Developer Console:**

### **1. Extension erstellen:**
1. Gehe zu [Twitch Developer Console](https://dev.twitch.tv/console/extensions)
2. **Create Extension** klicken
3. **Panel** auswählen
4. **Name:** `Leaderboard & Games`
5. **Summary:** `Interactive leaderboard with games like dice, lottery, and rock-paper-scissors`

### **2. Version hochladen:**
1. **Create Version** klicken
2. **Upload ZIP** → `leaderboard-extension.zip`
3. **Testing Base URI:** `https://einfachsven.xyz/twitch_extension/`
4. **Panel Viewer Path:** `panel.html`
5. **Panel Height:** `500`
6. **Config Path:** `config.html`
7. **Live Config Path:** `live_config.html`

### **3. Assets konfigurieren:**
- **Icon:** `assets/icon.svg` (1024x1024px)
- **Category:** `Other`
- **Language:** `German`

---

## 🔧 **Server Setup:**

### **1. Extension Route hinzufügen:**
```javascript
// In bot_overlay.js
app.use('/twitch_extension', express.static(path.join(__dirname, 'twitch_extension')));
```

### **2. CORS für Twitch:**
```javascript
app.use(cors({
  origin: ['https://www.twitch.tv', 'https://dashboard.twitch.tv'],
  credentials: true
}));
```

### **3. Extension API Endpoints:**
```javascript
// Extension-spezifische APIs
app.get('/api/extension/config', (req, res) => {
  // Extension Config API
});

app.post('/api/extension/action', (req, res) => {
  // Extension Actions API
});
```

---

## 🧪 **Testing:**

### **1. Local Testing:**
- **Testing Base URI:** `https://localhost:8080/twitch_extension/`
- **HTTPS** ist erforderlich für Twitch Extensions
- **SSL Certificate** für localhost einrichten

### **2. Production Testing:**
- **Testing Base URI:** `https://einfachsven.xyz/twitch_extension/`
- **Extension** in Twitch Channel aktivieren
- **Panel** in Channel About hinzufügen

---

## 📊 **Extension Features:**

### **🎮 Viewer Panel (panel.html):**
- **Live Leaderboard** mit Top 8 User
- **Interactive Games** → !dice, !lottery, !rps
- **User Stats** → Eigene Punkte anzeigen
- **Auto-Refresh** alle 30 Sekunden
- **Twitch Extension API** Integration

### **⚙️ Broadcaster Config (config.html):**
- **Point Settings** → Chat & Viewtime Punkte
- **Game Toggles** → Spiele ein/ausschalten
- **Live Preview** → Panel Vorschau
- **Configuration Storage** → Twitch Config API

### **🎛️ Live Config (live_config.html):**
- **Double Points Toggle** → Live umschalten
- **Lottery Draw** → Verlosung starten
- **Quick Actions** → Admin Commands
- **Live Stats** → Aktive User, Punkte, etc.
- **Status Monitoring** → Bot & API Status

---

## 🔐 **Security & Permissions:**

### **1. Required Permissions:**
```json
{
  "permissions": [
    "identity"
  ]
}
```

### **2. API Security:**
- **JWT Tokens** für Extension Requests
- **Rate Limiting** für API Calls
- **Input Validation** für alle Endpoints
- **CORS** für Twitch Domains

### **3. User Authentication:**
- **Twitch OAuth** für User Login
- **Session Management** für Extension Users
- **Admin Verification** für Live Config

---

## 📈 **Analytics & Monitoring:**

### **1. Extension Metrics:**
- **View Count** → Twitch Analytics
- **User Engagement** → Game Interactions
- **Config Changes** → Broadcaster Usage
- **API Performance** → Response Times

### **2. Error Handling:**
- **Graceful Degradation** bei API Fehlern
- **User Feedback** bei Problemen
- **Logging** für Debugging
- **Fallback Content** bei Datenfehlern

---

## 🚀 **Deployment:**

### **1. Production Setup:**
```bash
# Code aktualisieren
git pull origin main

# Extension Dateien kopieren
cp -r twitch_extension/ /var/www/html/

# Server neu starten
sudo systemctl restart nginx
```

### **2. SSL Certificate:**
- **Let's Encrypt** für HTTPS
- **Wildcard Certificate** für Subdomains
- **Auto-Renewal** konfigurieren

---

## 🎉 **Fertig!**

### **✅ Extension ist bereit:**
- **ZIP Datei** erstellt
- **Twitch Console** Setup Guide
- **Server Integration** vorbereitet
- **Testing** dokumentiert

### **📋 Nächste Schritte:**
1. **ZIP hochladen** in Twitch Developer Console
2. **Testing Base URI** konfigurieren
3. **Extension** in Channel aktivieren
4. **Panel** zu Channel About hinzufügen
5. **Testing** mit echten Usern

**Viel Erfolg mit deiner Twitch Extension!** 🚀
