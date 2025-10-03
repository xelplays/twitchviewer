# Chat Bot Badge Setup Guide

Dieser Guide erklärt, wie du das **Chat Bot Badge** für deinen Twitch Bot aktivierst, basierend auf der [offiziellen Twitch Dokumentation](https://dev.twitch.tv/docs/chat/#chatbot-badge-and-chat-identity).

## ⚠️ WICHTIGER HINWEIS

**Du brauchst einen SEPARATEN BOT-ACCOUNT!** 

- Der Bot-Account muss **anders** sein als dein Streamer-Account
- Der Bot-Username muss in `BOT_USERNAME` gesetzt sein
- Der Bot-Account muss den `channel:bot` Scope vom Streamer autorisiert bekommen
- **NICHT** deinen Streamer-Account als Bot verwenden!

## 🎯 Was ist das Chat Bot Badge?

Das Chat Bot Badge ist ein spezielles Badge, das Twitch-Chatbots anzeigen können, um zu zeigen, dass sie programmatisch Nachrichten senden. Es erscheint neben dem Bot-Namen im Chat und kategorisiert den Bot unter "Chat Bots" in der "Users in Chat" Liste.

## ✅ Anforderungen für das Chat Bot Badge

Laut der [Twitch Dokumentation](https://dev.twitch.tv/docs/chat/#chatbot-badge-and-chat-identity) muss dein Bot folgende Anforderungen erfüllen:

1. **Send Chat Message API verwenden** ✅ (implementiert)
2. **App Access Token verwenden** ✅ (implementiert)
3. **channel:bot scope** autorisiert vom Broadcaster ✅ (muss konfiguriert werden)
4. **Bot-Account ist nicht der Broadcaster** ✅ (separater Bot-Account)

## 🔧 Setup-Schritte

### 1. Twitch Developer Console

1. Gehe zur [Twitch Developer Console](https://dev.twitch.tv/console)
2. Erstelle eine **neue App** für deinen Bot (oder verwende eine bestehende)
3. Notiere dir die **Client ID** und **Client Secret**

### 2. App Access Token generieren

Du musst ein **App Access Token** generieren (nicht User Access Token):

```bash
# Ersetze YOUR_CLIENT_ID und YOUR_CLIENT_SECRET mit deinen Werten
curl -X POST 'https://id.twitch.tv/oauth2/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=client_credentials'
```

Die Antwort sollte so aussehen:
```json
{
  "access_token": "your_app_access_token_here",
  "expires_in": 0,
  "token_type": "Bearer"
}
```

### 3. channel:bot Scope autorisieren

**WICHTIG**: Du brauchst einen **separaten Bot-Account** (nicht deinen Streamer-Account!)

Der Broadcaster (Streamer) muss den `channel:bot` Scope für deinen Bot autorisieren:

1. Gehe zu: `https://id.twitch.tv/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&redirect_uri=http://localhost&response_type=code&scope=channel:bot`
2. Logge dich mit dem **Broadcaster-Account** ein (nicht dem Bot-Account!)
3. Autorisiere den Bot
4. Kopiere den Authorization Code aus der URL

**Wichtig**: Der Bot muss ein **separater Account** sein, nicht dein Streamer-Account!

### 4. Environment Variables setzen

Füge diese Variablen zu deiner `.env` Datei hinzu:

```env
# Bot Badge Configuration
TWITCH_BOT_APP_ACCESS_TOKEN=your_app_access_token_here
TWITCH_BOT_APP_CLIENT_ID=your_bot_client_id_here
```

### 5. Bot neu starten

```bash
pm2 restart bot_overlay
```

## 🔍 Verifizierung

### 1. Logs überprüfen

Wenn der Bot startet, solltest du diese Logs sehen:

```
- Bot App Access Token: Configured
- Bot App Client ID: your_client_id
- Chat Bot Badge: Enabled
```

### 2. Chat testen

Sende eine Test-Nachricht über den Bot:
```
!points
```

### 3. Badge überprüfen

- **Chat**: Der Bot sollte das **Chat Bot Badge** neben seinem Namen haben
- **Users in Chat**: Der Bot sollte unter "Chat Bots" kategorisiert sein

## 🚨 Fehlerbehebung

### "Chat Bot Badge: Disabled"
- Überprüfe, ob `TWITCH_BOT_APP_ACCESS_TOKEN` und `TWITCH_BOT_APP_CLIENT_ID` gesetzt sind
- Stelle sicher, dass der App Access Token gültig ist

### "Failed to send chat message via API"
- Überprüfe, ob der `channel:bot` Scope autorisiert ist
- Stelle sicher, dass der Broadcaster den Bot autorisiert hat (nicht der Bot selbst)

### "Broadcaster not found"
- Überprüfe, ob der `TWITCH_BOT_APP_CLIENT_ID` korrekt ist
- Stelle sicher, dass der Channel-Name in der Konfiguration stimmt

## 📋 Fallback-Verhalten

Wenn das API-Senden fehlschlägt, fällt der Bot automatisch auf IRC zurück:
- Kein Chat Bot Badge
- Normale IRC-Nachrichten
- Funktioniert wie vorher

## 🔗 Nützliche Links

- [Twitch Chat Bot Badge Dokumentation](https://dev.twitch.tv/docs/chat/#chatbot-badge-and-chat-identity)
- [Twitch Developer Console](https://dev.twitch.tv/console)
- [Send Chat Message API](https://dev.twitch.tv/docs/api/reference#send-chat-message)
- [OAuth Scopes](https://dev.twitch.tv/docs/authentication/scopes)

## 💡 Tipps

1. **Separate App**: Erstelle eine separate Twitch App für den Bot (nicht die gleiche wie für das Dashboard)
2. **Bot-Account**: Verwende einen separaten Bot-Account (nicht deinen Streamer-Account)
3. **Scope-Autorisierung**: Der Broadcaster muss den Bot autorisieren, nicht der Bot sich selbst
4. **Token-Refresh**: App Access Tokens laufen nie ab, aber User Access Tokens schon

---

**Hinweis**: Wenn du Probleme hast, überprüfe die Logs des Bots. Alle API-Aufrufe werden detailliert geloggt.
