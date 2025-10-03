# OBS Leaderboard Overlays

Dieses Projekt bietet drei verschiedene OBS-Overlay-Varianten für das Twitch Activity Leaderboard:

## Verfügbare Overlays

### 1. Standard Overlay (`/obs`)
- **URL**: `https://einfachsven.xyz/obs`
- **Features**: 
  - Top 5 Spieler
  - Punkte-Anzeige
  - Transparenter Hintergrund mit Blur-Effekt
  - Gold/Silber/Bronze-Rankings
  - Responsive Design

### 2. Mini Overlay (`/obs-mini`)
- **URL**: `https://einfachsven.xyz/obs-mini`
- **Features**:
  - Top 3 Spieler
  - Kompakteres Design
  - Weniger transparenter Hintergrund
  - Kleinere Schriftgrößen

### 3. Ultra Overlay (`/obs-ultra`)
- **URL**: `https://einfachsven.xyz/obs-ultra`
- **Features**:
  - Top 3 Spieler (nur Namen)
  - Minimalistisches Design
  - Sehr dezenter Hintergrund
  - Nur Ranking-Nummern und Namen

## OBS Setup

### Browser Source hinzufügen:
1. In OBS: **Quellen** → **Browser Source** hinzufügen
2. **URL** eingeben (z.B. `https://einfachsven.xyz/obs-mini`)
3. **Breite**: 300px (Standard), 250px (Mini), 200px (Ultra)
4. **Höhe**: 200px (Standard), 120px (Mini), 80px (Ultra)
5. **CSS**: Leer lassen
6. **Shutdown source when not visible**: ✅ aktivieren
7. **Refresh browser when scene becomes active**: ✅ aktivieren

### Empfohlene Einstellungen:

#### Standard Overlay:
- Breite: 300px
- Höhe: 250px
- Position: Rechts oben

#### Mini Overlay:
- Breite: 250px
- Höhe: 150px
- Position: Rechts oben

#### Ultra Overlay:
- Breite: 200px
- Höhe: 100px
- Position: Rechts oben

## Design-Features

### Transparenter Hintergrund
- Alle Overlays haben einen transparenten Hintergrund
- `backdrop-filter: blur()` für Glaseffekt
- Verschiedene Transparenz-Level je nach Overlay-Typ

### Responsive Design
- Automatische Anpassung an verschiedene Bildschirmgrößen
- Text-Overflow-Handling für lange Namen
- Hover-Effekte für bessere Interaktivität

### Animationen
- Sanfte Einblend-Animationen
- Staggered Loading (versetzte Animationen)
- Hover-Effekte

### Farben
- **Platz 1**: Gold (#ffd700)
- **Platz 2**: Silber (#c0c0c0)
- **Platz 3**: Bronze (#cd7f32)
- **Punkte**: Türkis (#00d4aa)
- **Hintergrund**: Transparent mit Blur

## Auto-Refresh
- Alle Overlays aktualisieren sich automatisch alle 30 Sekunden
- Sofortige Aktualisierung bei Seitenaufruf
- Fehlerbehandlung mit Retry-Logik

## Browser-Kompatibilität
- Chrome/Chromium (empfohlen für OBS)
- Firefox
- Safari
- Edge

## Troubleshooting

### Overlay lädt nicht:
1. URL in Browser testen
2. OBS Browser Source Einstellungen prüfen
3. Internetverbindung prüfen

### Text wird abgeschnitten:
1. Breite der Browser Source erhöhen
2. Schriftgröße in CSS anpassen (falls nötig)

### Performance-Probleme:
1. "Shutdown source when not visible" aktivieren
2. "Refresh browser when scene becomes active" aktivieren
3. Weniger Overlays gleichzeitig verwenden

## Anpassungen

Falls du die Overlays anpassen möchtest, kannst du die CSS-Dateien in `overlay_static/` bearbeiten:

- `obs_leaderboard.html` - Standard Version
- `obs_leaderboard_mini.html` - Mini Version  
- `obs_leaderboard_ultra.html` - Ultra Version

### Häufige Anpassungen:
- Schriftgrößen ändern
- Farben anpassen
- Transparenz-Level ändern
- Anzahl der angezeigten Spieler ändern
