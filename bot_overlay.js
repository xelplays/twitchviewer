require('dotenv').config();
const { ChatClient } = require('twitch-chat-client');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const axios = require('axios');

// Configuration from environment variables
const config = {
  botUsername: process.env.BOT_USERNAME,
  botOauth: process.env.BOT_OAUTH,
  channel: process.env.CHANNEL,
  adminKey: process.env.ADMIN_KEY,
  expressPort: parseInt(process.env.EXPRESS_PORT) || 3000,
  timezone: process.env.TIMEZONE || 'Europe/Berlin',
  
  // Bot behavior configuration
  heartbeatSeconds: parseInt(process.env.HEARTBEAT_SECONDS) || 60,
  presenceTimeoutSeconds: parseInt(process.env.PRESENCE_TIMEOUT_SECONDS) || 120,
  viewtimeSecondsPerPoint: parseInt(process.env.VIEWTIME_SECONDS_PER_POINT) || 60,
  pointsPerMessage: parseInt(process.env.POINTS_PER_MESSAGE) || 1,
  minSecondsBetweenChatPoints: parseInt(process.env.MIN_SECONDS_BETWEEN_CHAT_POINTS) || 30,
  maxChatPointsPerHour: parseInt(process.env.MAX_CHAT_POINTS_PER_HOUR) || 10,
  maxClipsPerDay: parseInt(process.env.MAX_CLIPS_PER_DAY) || 3,
  
  // Optional Twitch API
  twitchClientId: process.env.TWITCH_CLIENT_ID,
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET,
  enableEventSub: process.env.ENABLE_EVENTSUB === 'true',
  
  // OAuth Configuration
  sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-key',
  adminUsers: process.env.ADMIN_USERS ? process.env.ADMIN_USERS.split(',') : ['einfachsven']
};

// Validate required configuration
if (!config.botUsername || !config.botOauth || !config.channel || !config.adminKey) {
  console.error('Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

// Validate OAuth token format
if (!config.botOauth.startsWith('oauth:')) {
  console.error('BOT_OAUTH must start with "oauth:". Current value:', config.botOauth);
  process.exit(1);
}

// Log configuration (without sensitive data)
console.log('Bot Configuration:');
console.log('- Username:', config.botUsername);
console.log('- Channel:', config.channel);
console.log('- OAuth Token:', config.botOauth.substring(0, 10) + '...');
console.log('- Port:', config.expressPort);

// Initialize database
const dbPath = path.join(__dirname, 'activity.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

// Initialize database if it doesn't exist
const initDb = require('./migrations/init_db');
initDb();

// Twitch Chat Client Configuration
const chatClient = new ChatClient({
  authProvider: {
    getAccessToken: async () => config.botOauth.substring(6), // Remove 'oauth:' prefix
    getAppAccessToken: async () => null,
    getClientId: async () => config.twitchClientId
  },
  channels: [config.channel],
  logger: {
    minLevel: 'info'
  }
});

// Debug: Check if token and username are properly set
console.log('Chat Config Debug:');
console.log('- Username:', config.botUsername);
console.log('- Token (first 10 chars):', config.botOauth.substring(6, 16));
console.log('- Channel:', config.channel);
console.log('- Token length:', config.botOauth.substring(6).length);
console.log('- Client ID:', config.twitchClientId);

// Express app setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'overlay_static')));
app.use('/admin', express.static(path.join(__dirname, 'admin_static')));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard_static')));

// Session configuration
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Admin authentication middleware
function authenticateAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'] || req.query.admin_key;
  if (adminKey !== config.adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Utility functions
function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function logSuspiciousActivity(message, details = {}) {
  console.warn(`[SUSPICIOUS] ${message}`, details);
  // In production, you might want to log to a file or monitoring service
}

// Database utility functions
function getUser(username) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM points WHERE username = ?', [username.toLowerCase()], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function createUser(username, displayName) {
  return new Promise((resolve, reject) => {
    const now = getCurrentTimestamp();
    db.run(
      'INSERT INTO points (username, display_name, last_seen_ts) VALUES (?, ?, ?)',
      [username.toLowerCase(), displayName, now],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function updateUser(username, updates) {
  return new Promise((resolve, reject) => {
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(username.toLowerCase());
    
    db.run(
      `UPDATE points SET ${setClause} WHERE username = ?`,
      values,
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

function addPointsToUser(username, points, reason = 'manual') {
  return new Promise((resolve, reject) => {
    getUser(username).then(user => {
      if (!user) {
        return reject(new Error('User not found'));
      }
      
      const oldPoints = user.points;
      const newPoints = oldPoints + points;
      
      // Log suspicious activity for large point increases
      if (points > 50) {
        logSuspiciousActivity(`Large point increase for ${username}`, {
          points: points,
          reason: reason,
          oldTotal: oldPoints,
          newTotal: newPoints
        });
      }
      
      updateUser(username, { points: newPoints }).then(() => {
        resolve(newPoints);
      }).catch(reject);
    }).catch(reject);
  });
}

function getTopUsers(limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT username, display_name, points FROM points ORDER BY points DESC LIMIT ?',
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

function getActiveUsers() {
  return new Promise((resolve, reject) => {
    const timeout = getCurrentTimestamp() - config.presenceTimeoutSeconds;
    db.all(
      'SELECT username FROM points WHERE last_seen_ts > ?',
      [timeout],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.username));
      }
    );
  });
}

// API Endpoints
app.get('/top10', async (req, res) => {
  try {
    const topUsers = await getTopUsers(10);
    const response = {
      generated_at: Date.now(),
      top: topUsers.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        display_name: user.display_name,
        points: user.points
      }))
    };
    res.json(response);
  } catch (error) {
    console.error('Error fetching top 10:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/clips/pending', authenticateAdmin, async (req, res) => {
  try {
    db.all(
      'SELECT id, submitter, display_name, clip_url, submitted_at FROM clips WHERE status = ? ORDER BY submitted_at DESC',
      ['pending'],
      (err, rows) => {
        if (err) {
          console.error('Error fetching pending clips:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        res.json({ pending: rows });
      }
    );
  } catch (error) {
    console.error('Error fetching pending clips:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/clips/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const clipId = parseInt(req.params.id);
    const { points = 0, note = '' } = req.body;
    
    if (!clipId || points < 0) {
      return res.status(400).json({ error: 'Invalid clip ID or points' });
    }
    
    // Get clip details
    db.get('SELECT * FROM clips WHERE id = ? AND status = ?', [clipId, 'pending'], async (err, clip) => {
      if (err) {
        console.error('Error fetching clip:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      
      if (!clip) {
        return res.status(404).json({ error: 'Clip not found or already processed' });
      }
      
      // Update clip status
      const now = getCurrentTimestamp();
      db.run(
        'UPDATE clips SET status = ?, reviewer = ?, points_awarded = ?, reviewed_at = ?, note = ? WHERE id = ?',
        ['approved', 'web-admin', points, now, note, clipId],
        async (err) => {
          if (err) {
            console.error('Error updating clip:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }
          
          // Award points to submitter
          if (points > 0) {
            try {
              const newTotal = await addPointsToUser(clip.submitter, points, 'clip-approval');
              
              // Announce in chat
              sendChatMessage( `🎉 @${clip.submitter} submitted a great clip and earned ${points} points! Total: ${newTotal}`);
              
              res.json({ ok: true, newPointsTotal: newTotal });
            } catch (error) {
              console.error('Error awarding points:', error);
              res.status(500).json({ error: 'Failed to award points' });
            }
          } else {
            res.json({ ok: true, newPointsTotal: 0 });
          }
        }
      );
    });
  } catch (error) {
    console.error('Error approving clip:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/clips/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const clipId = parseInt(req.params.id);
    const { note = '' } = req.body;
    
    if (!clipId) {
      return res.status(400).json({ error: 'Invalid clip ID' });
    }
    
    const now = getCurrentTimestamp();
    db.run(
      'UPDATE clips SET status = ?, reviewer = ?, reviewed_at = ?, note = ? WHERE id = ?',
      ['rejected', 'web-admin', now, note, clipId],
      (err) => {
        if (err) {
          console.error('Error rejecting clip:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        res.json({ ok: true });
      }
    );
  } catch (error) {
    console.error('Error rejecting clip:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// OAuth Routes
app.get('/auth/twitch', (req, res) => {
  const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
    `client_id=${config.twitchClientId}&` +
    `redirect_uri=${encodeURIComponent(`http://${req.get('host')}/auth/twitch/callback`)}&` +
    `response_type=code&` +
    `scope=user:read:email`;
  
  res.redirect(authUrl);
});

app.get('/auth/twitch/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.redirect('/dashboard?error=no_code');
    }
    
    // Exchange code for access token
    const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', {
      client_id: config.twitchClientId,
      client_secret: config.twitchClientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: `http://${req.get('host')}/auth/twitch/callback`
    });
    
    const { access_token } = tokenResponse.data;
    
    // Get user info
    const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': config.twitchClientId,
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    const user = userResponse.data.data[0];
    
    // Store in session
    req.session.user = {
      id: user.id,
      username: user.login,
      displayName: user.display_name,
      email: user.email,
      isAdmin: config.adminUsers.includes(user.login.toLowerCase())
    };
    
    res.redirect('/dashboard');
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/dashboard?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/dashboard');
});

// Dashboard API Endpoints
app.get('/api/user/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json(req.session.user);
});

app.get('/api/user/stats', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const user = await getUser(req.session.user.username);
    if (!user) {
      return res.json({ points: 0, view_seconds: 0, message_count: 0 });
    }
    
    res.json({
      points: user.points,
      view_seconds: user.view_seconds,
      message_count: user.message_count,
      last_seen: user.last_seen_ts
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const topUsers = await getTopUsers(50);
    const response = {
      generated_at: Date.now(),
      top: topUsers.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        display_name: user.display_name,
        points: user.points
      }))
    };
    res.json(response);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/winners', (req, res) => {
  try {
    db.all(
      'SELECT * FROM winners ORDER BY month DESC, rank ASC',
      [],
      (err, rows) => {
        if (err) {
          console.error('Error fetching winners:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(rows);
      }
    );
  } catch (error) {
    console.error('Error fetching winners:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin Dashboard API Endpoints
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    db.all(
      'SELECT username, display_name, points, view_seconds, message_count, last_seen_ts FROM points ORDER BY points DESC LIMIT 100',
      [],
      (err, rows) => {
        if (err) {
          console.error('Error fetching users:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(rows);
      }
    );
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/give-points', requireAdmin, async (req, res) => {
  try {
    const { username, points, reason = 'admin-give' } = req.body;
    
    if (!username || !points || points <= 0) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    const newTotal = await addPointsToUser(username, points, reason);
    
    res.json({ 
      ok: true, 
      username, 
      pointsAdded: points, 
      newTotal 
    });
  } catch (error) {
    console.error('Error giving points:', error);
    res.status(500).json({ error: 'Failed to give points' });
  }
});

app.post('/api/admin/end-month', requireAdmin, async (req, res) => {
  try {
    const { winners } = req.body;
    
    if (!winners || !Array.isArray(winners) || winners.length === 0) {
      return res.status(400).json({ error: 'Invalid winners data' });
    }
    
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Save winners
    const timestamp = getCurrentTimestamp();
    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i];
      
      db.run(
        'INSERT INTO winners (month, rank, username, display_name, points, awarded_at) VALUES (?, ?, ?, ?, ?, ?)',
        [currentMonth, i + 1, winner.username, winner.display_name, winner.points, timestamp],
        function(err) {
          if (err) {
            console.error('Error saving winner:', err);
          }
        }
      );
    }
    
    // Announce in chat
    const announcement = winners.map((winner, index) => 
      `${index + 1}. ${winner.display_name || winner.username} (${winner.points} Punkte)`
    ).join(' | ');
    
    sendChatMessage( `🏆 Monats-Sieger ${currentMonth}: ${announcement}`);
    
    // Reset all points
    db.run('UPDATE points SET points = 0, view_seconds = 0', (err) => {
      if (err) {
        console.error('Error resetting points:', err);
      } else {
        sendChatMessage( '🎯 Alle Punkte wurden für den neuen Monat zurückgesetzt!');
      }
    });
    
    res.json({ ok: true, month: currentMonth, winners: winners.length });
    
  } catch (error) {
    console.error('Error ending month:', error);
    res.status(500).json({ error: 'Failed to end month' });
  }
});

// Chat command handlers
async function handleChatMessage({ channel, user, message, msg }) {
  const username = user;
  const displayName = msg.userInfo.displayName || username;
  const isMod = msg.userInfo.isMod;
  const isBroadcaster = msg.userInfo.isBroadcaster;
  const isAdmin = isMod || isBroadcaster;
  
  // Update user presence
  const now = getCurrentTimestamp();
  let user = await getUser(username);
  if (!user) {
    await createUser(username, displayName);
    user = await getUser(username);
  }
  
  // Update last seen and message count
  await updateUser(username, {
    last_seen_ts: now,
    message_count: (user.message_count || 0) + 1,
    display_name: displayName
  });
  
  // Award chat points (with anti-spam measures) - disabled for testing
  const enableChatPoints = false; // Set to true to enable chat points
  
  if (enableChatPoints) {
    const timeSinceLastMessage = now - (user.last_message_ts || 0);
    const timeSinceHourReset = now - (user.chat_points_hour_reset_ts || 0);
    
    if (timeSinceLastMessage >= config.minSecondsBetweenChatPoints) {
      let chatPointsThisHour = user.chat_points_last_hour || 0;
      
      // Reset hourly counter if needed
      if (timeSinceHourReset >= 3600) {
        chatPointsThisHour = 0;
      }
      
      if (chatPointsThisHour < config.maxChatPointsPerHour) {
        chatPointsThisHour += config.pointsPerMessage;
        const newTotal = await addPointsToUser(username, config.pointsPerMessage, 'chat-message');
        
        await updateUser(username, {
          last_message_ts: now,
          chat_points_last_hour: chatPointsThisHour,
          chat_points_hour_reset_ts: timeSinceHourReset >= 3600 ? now : user.chat_points_hour_reset_ts
        });
      }
    }
  }
  
  // Parse commands
  const args = message.trim().split(' ');
  const command = args[0].toLowerCase();
  
  switch (command) {
    case '!punkte':
    case '!points':
      const userPoints = await getUser(username);
      sendChatMessage( `@${username} hat ${userPoints.points} Punkte! 🎯`);
      break;
      
    case '!top':
    case '!leaderboard':
      try {
        const topUsers = await getTopUsers(5);
        const leaderboard = topUsers.map((user, index) => 
          `${index + 1}. ${user.display_name || user.username}: ${user.points}`
        ).join(' | ');
        sendChatMessage( `🏆 Top 5: ${leaderboard}`);
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      }
      break;
      
    case '!submitclip':
      if (args.length < 2) {
        sendChatMessage( `@${username} Usage: !submitclip <clip_url>`);
        break;
      }
      
      const clipUrl = args[1];
      if (!isValidClipUrl(clipUrl)) {
        sendChatMessage( `@${username} Bitte gib eine gültige Twitch Clip URL an!`);
        break;
      }
      
      // Check daily limit
      const todayStart = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
      db.get(
        'SELECT COUNT(*) as count FROM clips WHERE submitter = ? AND submitted_at > ?',
        [username.toLowerCase(), Math.floor(todayStart / 1000)],
        (err, result) => {
          if (err) {
            console.error('Error checking clip limit:', err);
            return;
          }
          
          if (result.count >= config.maxClipsPerDay) {
            sendChatMessage( `@${username} Du hast bereits ${config.maxClipsPerDay} Clips heute eingereicht!`);
            return;
          }
          
          // Check for duplicate URL and validate ownership
          db.get('SELECT id, submitter FROM clips WHERE clip_url = ?', [clipUrl], (err, existing) => {
            if (err) {
              console.error('Error checking duplicate clip:', err);
              return;
            }
            
            if (existing) {
              // Check if the same user is submitting the same clip
              if (existing.submitter === username.toLowerCase()) {
                sendChatMessage( `@${username} Du hast diesen Clip bereits eingereicht!`);
              } else {
                sendChatMessage( `@${username} Dieser Clip wurde bereits von jemand anderem eingereicht!`);
              }
              return;
            }
            
            // Validate that the user is the creator of the clip (basic check)
            if (!validateClipOwnership(clipUrl, username)) {
              sendChatMessage( `@${username} Du kannst nur deine eigenen Clips einreichen!`);
              return;
            }
            
            // Submit clip
            const clipId = extractClipId(clipUrl);
            db.run(
              'INSERT INTO clips (submitter, display_name, clip_url, clip_id, submitted_at) VALUES (?, ?, ?, ?, ?)',
              [username.toLowerCase(), displayName, clipUrl, clipId, now],
              function(err) {
                if (err) {
                  console.error('Error submitting clip:', err);
                  sendChatMessage( `@${username} Fehler beim Einreichen des Clips!`);
                } else {
                  sendChatMessage( `@${username} Clip eingereicht! (ID: ${this.lastID}) Wird von den Mods geprüft.`);
                }
              }
            );
          });
        }
      );
      break;
      
    case '!clips':
      if (!isAdmin) break;
      
      if (args[1] === 'pending') {
        db.all('SELECT id, submitter, display_name FROM clips WHERE status = ? ORDER BY submitted_at DESC LIMIT 5', ['pending'], (err, rows) => {
          if (err) {
            console.error('Error fetching pending clips:', err);
            return;
          }
          
          if (rows.length === 0) {
            sendChatMessage( 'Keine ausstehenden Clips!');
          } else {
            const clipsList = rows.map(clip => `${clip.id}: @${clip.submitter}`).join(', ');
            sendChatMessage( `Ausstehende Clips: ${clipsList}`);
          }
        });
      }
      break;
      
    case '!clipapprove':
      if (!isAdmin) break;
      
      if (args.length < 3) {
        sendChatMessage( `@${username} Usage: !clipapprove <id> <points> [note]`);
        break;
      }
      
      const approveId = parseInt(args[1]);
      const approvePoints = parseInt(args[2]);
      const approveNote = args.slice(3).join(' ') || '';
      
      if (isNaN(approveId) || isNaN(approvePoints) || approvePoints < 0) {
        sendChatMessage( `@${username} Ungültige ID oder Punkte!`);
        break;
      }
      
      // Approve clip via database
      db.get('SELECT * FROM clips WHERE id = ? AND status = ?', [approveId, 'pending'], async (err, clip) => {
        if (err) {
          console.error('Error fetching clip for approval:', err);
          return;
        }
        
        if (!clip) {
          sendChatMessage( `@${username} Clip ${approveId} nicht gefunden oder bereits bearbeitet!`);
          return;
        }
        
        // Update clip
        db.run(
          'UPDATE clips SET status = ?, reviewer = ?, points_awarded = ?, reviewed_at = ?, note = ? WHERE id = ?',
          ['approved', username, approvePoints, now, approveNote, approveId],
          async (err) => {
            if (err) {
              console.error('Error approving clip:', err);
              sendChatMessage( `@${username} Fehler beim Approven des Clips!`);
              return;
            }
            
            // Award points
            if (approvePoints > 0) {
              try {
                const newTotal = await addPointsToUser(clip.submitter, approvePoints, 'clip-approval-chat');
                sendChatMessage( `✅ Clip ${approveId} approved! @${clip.submitter} +${approvePoints} Punkte (Total: ${newTotal})`);
              } catch (error) {
                console.error('Error awarding points:', error);
                sendChatMessage( `@${username} Fehler beim Verteilen der Punkte!`);
              }
            } else {
              sendChatMessage( `✅ Clip ${approveId} approved! @${clip.submitter} keine Punkte.`);
            }
          }
        );
      });
      break;
      
    case '!clipreject':
      if (!isAdmin) break;
      
      if (args.length < 2) {
        sendChatMessage( `@${username} Usage: !clipreject <id> [note]`);
        break;
      }
      
      const rejectId = parseInt(args[1]);
      const rejectNote = args.slice(2).join(' ') || '';
      
      if (isNaN(rejectId)) {
        sendChatMessage( `@${username} Ungültige ID!`);
        break;
      }
      
      db.run(
        'UPDATE clips SET status = ?, reviewer = ?, reviewed_at = ?, note = ? WHERE id = ?',
        ['rejected', username, now, rejectNote, rejectId],
        (err) => {
          if (err) {
            console.error('Error rejecting clip:', err);
            sendChatMessage( `@${username} Fehler beim Ablehnen des Clips!`);
          } else {
            sendChatMessage( `❌ Clip ${rejectId} rejected.`);
          }
        }
      );
      break;
      
    case '!give':
      if (!isAdmin) break;
      
      if (args.length < 3) {
        sendChatMessage( `@${username} Usage: !give <user> <amount>`);
        break;
      }
      
      const targetUser = args[1].toLowerCase().replace('@', '');
      const giveAmount = parseInt(args[2]);
      
      if (isNaN(giveAmount) || giveAmount <= 0) {
        sendChatMessage( `@${username} Ungültige Punkte-Anzahl!`);
        break;
      }
      
      try {
        const newTotal = await addPointsToUser(targetUser, giveAmount, 'admin-give');
        sendChatMessage( `🎁 @${targetUser} +${giveAmount} Punkte! Total: ${newTotal}`);
      } catch (error) {
        console.error('Error giving points:', error);
        sendChatMessage( `@${username} Fehler beim Verteilen der Punkte!`);
      }
      break;
      
    case '!dropall':
      if (!isAdmin) break;
      
      if (args.length < 2) {
        sendChatMessage( `@${username} Usage: !dropall <amount>`);
        break;
      }
      
      const dropAmount = parseInt(args[2]);
      
      if (isNaN(dropAmount) || dropAmount <= 0) {
        sendChatMessage( `@${username} Ungültige Punkte-Anzahl!`);
        break;
      }
      
      try {
        const activeUsers = await getActiveUsers();
        if (activeUsers.length === 0) {
          sendChatMessage( `@${username} Keine aktiven User gefunden!`);
          break;
        }
        
        for (const activeUser of activeUsers) {
          await addPointsToUser(activeUser, dropAmount, 'admin-dropall');
        }
        
        sendChatMessage( `🎊 Alle ${activeUsers.length} aktiven User haben +${dropAmount} Punkte erhalten!`);
      } catch (error) {
        console.error('Error dropping points to all:', error);
        sendChatMessage( `@${username} Fehler beim Verteilen der Punkte!`);
      }
      break;
      
    case '!droprandom':
      if (!isAdmin) break;
      
      if (args.length < 3) {
        sendChatMessage( `@${username} Usage: !droprandom <amount> <count>`);
        break;
      }
      
      const randomAmount = parseInt(args[1]);
      const randomCount = parseInt(args[2]);
      
      if (isNaN(randomAmount) || isNaN(randomCount) || randomAmount <= 0 || randomCount <= 0) {
        sendChatMessage( `@${username} Ungültige Parameter!`);
        break;
      }
      
      try {
        const activeUsers = await getActiveUsers();
        if (activeUsers.length === 0) {
          sendChatMessage( `@${username} Keine aktiven User gefunden!`);
          break;
        }
        
        // Shuffle and take random users
        const shuffled = activeUsers.sort(() => 0.5 - Math.random());
        const selectedUsers = shuffled.slice(0, Math.min(randomCount, activeUsers.length));
        
        for (const selectedUser of selectedUsers) {
          await addPointsToUser(selectedUser, randomAmount, 'admin-droprandom');
        }
        
        sendChatMessage( `🎲 ${selectedUsers.length} zufällige User haben +${randomAmount} Punkte erhalten!`);
      } catch (error) {
        console.error('Error dropping random points:', error);
        sendChatMessage( `@${username} Fehler beim Verteilen der Punkte!`);
      }
      break;
  }
}

// Utility functions for clip handling
function isValidClipUrl(url) {
  const twitchClipPattern = /^https?:\/\/(clips\.twitch\.tv\/[^\/\s]+|www\.twitch\.tv\/[^\/\s]+\/clip\/[^\/\s]+)/i;
  return twitchClipPattern.test(url);
}

function extractClipId(url) {
  const match = url.match(/\/clip\/([^\/\s]+)|\/([^\/\s]+)$/);
  return match ? (match[1] || match[2]) : null;
}

// Basic clip ownership validation (for testing - in production use Twitch API)
function validateClipOwnership(clipUrl, username) {
  // For now, we'll do a basic check based on URL pattern
  // In production, you should use Twitch API to verify clip ownership
  
  // Extract channel from clip URL
  const channelMatch = clipUrl.match(/twitch\.tv\/([^\/\s]+)/);
  if (channelMatch) {
    const channelFromUrl = channelMatch[1].toLowerCase();
    const usernameLower = username.toLowerCase();
    
    // If the channel in URL matches the submitter, it's likely their clip
    // This is a basic check - for production use Twitch API
    if (channelFromUrl === usernameLower) {
      return true;
    }
  }
  
  // For testing purposes, allow all clips (return true)
  // In production, set this to false and use Twitch API validation
  console.log(`[DEBUG] Clip ownership validation for ${username}: ${clipUrl}`);
  return true; // Allow all for testing
}

// Viewtime tracking - disabled for testing
async function updateViewtime() {
  const enableViewtimePoints = false; // Set to true to enable viewtime points
  
  if (!enableViewtimePoints) {
    return; // Skip viewtime tracking for testing
  }
  
  try {
    const timeout = getCurrentTimestamp() - config.presenceTimeoutSeconds;
    
    db.all('SELECT * FROM points WHERE last_seen_ts > ?', [timeout], async (err, activeUsers) => {
      if (err) {
        console.error('Error fetching active users for viewtime:', err);
        return;
      }
      
      for (const user of activeUsers) {
        const newViewSeconds = user.view_seconds + config.heartbeatSeconds;
        let pointsToAdd = 0;
        let remainingViewSeconds = newViewSeconds;
        
        // Calculate points from viewtime
        while (remainingViewSeconds >= config.viewtimeSecondsPerPoint) {
          pointsToAdd += 1;
          remainingViewSeconds -= config.viewtimeSecondsPerPoint;
        }
        
        // Update user with new viewtime and points
        if (pointsToAdd > 0) {
          await addPointsToUser(user.username, pointsToAdd, 'viewtime');
        }
        
        await updateUser(user.username, { view_seconds: remainingViewSeconds });
      }
    });
  } catch (error) {
    console.error('Error updating viewtime:', error);
  }
}

// Monthly cron job for top 2 winners
function runMonthlyJob() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  
  console.log(`Running monthly job for ${monthKey}`);
  
  // Get top 2 users from last month
  db.all(
    'SELECT username, display_name, points FROM points WHERE points > 0 ORDER BY points DESC LIMIT 2',
    [],
    async (err, topUsers) => {
      if (err) {
        console.error('Error fetching top users for monthly job:', err);
        return;
      }
      
      const now = getCurrentTimestamp();
      
      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        
        db.run(
          'INSERT INTO winners (month, rank, username, display_name, points, awarded_at) VALUES (?, ?, ?, ?, ?, ?)',
          [monthKey, i + 1, user.username, user.display_name, user.points, now],
          function(err) {
            if (err) {
              console.error('Error saving winner:', err);
            }
          }
        );
      }
      
      // Announce winners in chat
      if (topUsers.length > 0) {
        const announcement = topUsers.map((user, index) => 
          `${index + 1}. ${user.display_name || user.username} (${user.points} Punkte)`
        ).join(' | ');
        
        sendChatMessage( `🏆 Monats-Sieger ${monthKey}: ${announcement}`);
      }
      
      // Reset all points (optional - you might want to keep history)
      db.run('UPDATE points SET points = 0, view_seconds = 0', (err) => {
        if (err) {
          console.error('Error resetting points:', err);
        } else {
          console.log('Points reset for new month');
          sendChatMessage( '🎯 Alle Punkte wurden für den neuen Monat zurückgesetzt!');
        }
      });
    }
  );
}

// Helper function to send messages using twitch-chat-client API
async function sendChatMessage(message) {
  console.log('🔍 sendChatMessage called with:', message);
  try {
    // Use the correct twitch-chat-client method for sending messages
    console.log('🔍 Sending message to channel:', config.channel);
    await chatClient.say(config.channel, message);
    console.log('✅ Message sent successfully');
    return true;
  } catch (error) {
    console.log('❌ Failed to send message:', error.message);
    console.log('❌ Error details:', error);
    return false;
  }
}

// Event handlers
chatClient.onMessage(async (channel, user, message, msg) => {
  await handleChatMessage({ channel, user, message, msg });
});

chatClient.onConnect(async () => {
  console.log(`✅ Connected to Twitch Chat!`);
  await sendChatMessage('Bot ist online! 🚀');
});

chatClient.onDisconnect(() => {
  console.log(`❌ Disconnected from Twitch Chat!`);
});

// Start viewtime tracking
setInterval(updateViewtime, config.heartbeatSeconds * 1000);

// Monthly cron job (1st of each month at 00:00)
cron.schedule('0 0 1 * *', runMonthlyJob, {
  timezone: config.timezone
});

// Start Express server
app.listen(config.expressPort, '0.0.0.0', () => {
  console.log(`Express server running on port ${config.expressPort}`);
  console.log(`Overlay URL: http://0.0.0.0:${config.expressPort}/overlay.html`);
  console.log(`Admin Dashboard: http://0.0.0.0:${config.expressPort}/admin/clips.html?admin_key=${config.adminKey}`);
});

// Connect to Twitch
chatClient.connect();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  chatClient.disconnect();
  db.close();
  process.exit(0);
});

module.exports = { app, chatClient, db };
