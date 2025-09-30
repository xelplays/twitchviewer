# 📤 GitHub Upload Anleitung

Diese Anleitung hilft dir dabei, das Twitch Activity Bot Projekt auf GitHub zu veröffentlichen.

## 🚀 Schnellstart (GitHub Desktop)

### 1. GitHub Desktop installieren
- Gehe zu https://desktop.github.com/
- Installiere GitHub Desktop
- Melde dich mit deinem GitHub Account an

### 2. Repository auf GitHub erstellen
1. Gehe zu https://github.com
2. Klicke "New repository"
3. Repository Name: `twitch-activity-leaderboard`
4. Beschreibung: `🎮 Twitch Activity Bot mit Viewtime-Tracking, Clip-Submissions und OBS-Overlay`
5. Setze auf **Public** (damit andere es sehen können)
6. **WICHTIG**: Füge KEINE .gitignore, README oder LICENSE hinzu
7. Klicke "Create repository"

### 3. Projekt hochladen
1. Öffne GitHub Desktop
2. Klicke "Add an Existing Repository from your Hard Drive"
3. Wähle: `C:\Users\sveng\Documents\Vieweractivity`
4. Commit-Nachricht eingeben:
   ```
   Initial commit: Twitch Activity Leaderboard Bot
   
   - Complete bot implementation with tmi.js
   - Viewtime tracking and chat points system
   - Clip submission and review system
   - OBS overlay with live leaderboard
   - Admin dashboard for clip management
   - REST API with authentication
   - Monthly winner cron job
   - Anti-spam and security measures
   - Optional Twitch API integration
   - Comprehensive documentation
   ```
5. Klicke "Commit to main"
6. Klicke "Publish repository"
7. Wähle dein GitHub Repository aus
8. Klicke "Publish Repository"

## 💻 Command Line (für Fortgeschrittene)

### 1. Git installieren
- Gehe zu https://git-scm.com/download/win
- Installiere Git für Windows
- Starte PowerShell neu

### 2. Repository erstellen (wie oben)

### 3. Projekt hochladen
```bash
# In PowerShell im Projektordner
git init
git add .
git commit -m "Initial commit: Twitch Activity Leaderboard Bot

- Complete bot implementation with tmi.js
- Viewtime tracking and chat points system
- Clip submission and review system
- OBS overlay with live leaderboard
- Admin dashboard for clip management
- REST API with authentication
- Monthly winner cron job
- Anti-spam and security measures
- Optional Twitch API integration
- Comprehensive documentation"

git branch -M main
git remote add origin https://github.com/DEIN_USERNAME/twitch-activity-leaderboard.git
git push -u origin main
```

## 🎨 Repository optimieren

### Nach dem Upload:
1. **Repository Beschreibung** hinzufügen:
   ```
   🎮 Twitch Activity Bot mit Viewtime-Tracking, Clip-Submissions und OBS-Overlay. Features: Chat-Punkte, Admin-Dashboard, REST API, monatliche Gewinner-Auswertung.
   ```

2. **Topics** hinzufügen:
   ```
   twitch, bot, leaderboard, overlay, obs, nodejs, express, sqlite, tmi-js, streaming, javascript
   ```

3. **About Section** konfigurieren:
   - Website: `http://localhost:3000`
   - Topics: `twitch bot leaderboard overlay obs nodejs`

4. **README.md** anpassen:
   - GitHub Username in den Beispielen anpassen
   - Repository URL hinzufügen
   - Installation von GitHub hinzufügen

## 📋 Checkliste

- [ ] Git/GitHub Desktop installiert
- [ ] GitHub Repository erstellt
- [ ] Alle Dateien hochgeladen
- [ ] Repository Beschreibung hinzugefügt
- [ ] Topics konfiguriert
- [ ] README.md angepasst
- [ ] .env.example ist enthalten (KEIN .env!)
- [ ] activity.db ist NICHT hochgeladen (steht in .gitignore)

## 🔒 Sicherheit

**WICHTIG**: Stelle sicher, dass keine sensiblen Daten hochgeladen werden:
- ✅ `.env` ist in `.gitignore` (wird NICHT hochgeladen)
- ✅ `env.example` ist enthalten (Template für andere)
- ✅ Keine OAuth Tokens im Code
- ✅ Keine Admin Keys im Code

## 🎯 Nach dem Upload

1. **Issues aktivieren**: Lass andere Bugs melden
2. **Discussions aktivieren**: Für Fragen und Community
3. **Releases erstellen**: Bei Updates
4. **Wiki nutzen**: Für erweiterte Dokumentation

## 📞 Hilfe

Falls du Probleme hast:
1. GitHub Desktop Logs prüfen
2. Internetverbindung testen
3. GitHub Account Berechtigung prüfen
4. Repository Name auf Verfügbarkeit prüfen

---

**Viel Erfolg beim Upload! 🚀**
