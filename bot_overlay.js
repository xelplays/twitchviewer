require('dotenv').config();
const { ChatClient } = require('@twurple/chat');
const { StaticAuthProvider } = require('@twurple/auth');
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
  twitchBotClientId: process.env.TWITCH_BOT_CLIENT_ID || process.env.TWITCH_CLIENT_ID,
  twitchBotAccessToken: process.env.TWITCH_BOT_APP_ACCESS_TOKEN || process.env.TWITCH_CLIENT_SECRET,
  twitchBotAppAccessToken: process.env.TWITCH_BOT_APP_ACCESS_TOKEN,
  twitchBotAppClientId: process.env.TWITCH_BOT_APP_CLIENT_ID || process.env.TWITCH_BOT_CLIENT_ID || process.env.TWITCH_CLIENT_ID,
  enableEventSub: process.env.ENABLE_EVENTSUB === 'true',
  
  // Stream Status Configuration
  streamOfflineCheck: process.env.STREAM_OFFLINE_CHECK !== 'false',
  
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
function initDatabase() {
  console.log('Initializing database...');
  
  // Read and execute init.sql
  const initSqlPath = path.join(__dirname, 'migrations', 'init.sql');
  const sql = fs.readFileSync(initSqlPath, 'utf8');
  
  db.exec(sql, (err) => {
    if (err) {
      console.error('Error running migrations:', err.message);
    } else {
      console.log('Database initialized successfully!');
    }
  });
}

// Run database initialization
initDatabase();

// Twitch Chat Client Configuration
const authProvider = new StaticAuthProvider(config.twitchClientId, config.botOauth.substring(6));
const chatClient = new ChatClient({
  authProvider,
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
console.log('- Dashboard Client ID:', config.twitchClientId);
console.log('- Bot Client ID:', config.twitchBotClientId);
console.log('- Bot App Access Token:', config.twitchBotAppAccessToken ? 'Configured' : 'Not configured');
console.log('- Bot App Client ID:', config.twitchBotAppClientId);
console.log('- Chat Bot Badge:', config.twitchBotAppAccessToken && config.twitchBotAppClientId ? 'Enabled' : 'Disabled');

// Express app setup
const app = express();
app.use(cors({
  origin: [
    'https://www.twitch.tv',
    'https://dashboard.twitch.tv',
    'https://extension-files.twitch.tv'
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'overlay_static')));
app.use('/admin', express.static(path.join(__dirname, 'admin_static')));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard_static')));
app.use('/twitch_panel', express.static(path.join(__dirname, 'twitch_panel')));
app.use('/twitch_extension', express.static(path.join(__dirname, 'twitch_extension')));
app.use(express.static(path.join(__dirname, 'public')));

// OBS-specific overlay routes
app.get('/obs', (req, res) => {
  res.redirect('/overlay/obs_leaderboard.html');
});

app.get('/obs-mini', (req, res) => {
  res.redirect('/overlay/obs_leaderboard_mini.html');
});

app.get('/obs-ultra', (req, res) => {
  res.redirect('/overlay/obs_leaderboard_ultra.html');
});

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

// Helper function to check if stream is live
async function isStreamLive() {
  console.log(`🔍 Stream offline check config: ${config.streamOfflineCheck} (env: ${process.env.STREAM_OFFLINE_CHECK})`);
  
  // If stream offline check is disabled, always assume stream is live
  if (!config.streamOfflineCheck) {
    console.log('📺 Stream offline check disabled, assuming stream is live');
    return true;
  }
  
  // If no bot access token is configured, assume stream is live to allow chat points
  if (!config.twitchBotAccessToken) {
    console.log('📺 No bot access token configured, assuming stream is live');
    return true;
  }
  
  try {
    const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${config.channel}`, {
      headers: {
        'Client-ID': config.twitchBotClientId,
        'Authorization': `Bearer ${config.twitchBotAccessToken}`
      }
    });
    
    if (!response.ok) {
      console.error('Error checking stream status:', response.status);
      // If API fails, assume stream is live to allow chat points
      return true;
    }
    
    const data = await response.json();
    return data.data && data.data.length > 0;
  } catch (error) {
    console.error('Error checking stream status:', error);
    // If API fails, assume stream is live to allow chat points
    return true;
  }
}

// Helper function to check if user is a bot
function isUserBot(username) {
  return new Promise((resolve) => {
    db.get('SELECT * FROM bot_blacklist WHERE username = ?', [username.toLowerCase()], (err, result) => {
      if (err) {
        console.error('Error checking bot status:', err);
        resolve(false);
        return;
      }
      
      console.log(`🔍 Bot check for ${username}:`, result ? 'FOUND IN BLACKLIST' : 'NOT FOUND');
      if (result) {
        console.log(`🔍 Bot details:`, result);
        console.log(`🔍 Bot details JSON:`, JSON.stringify(result));
        console.log(`🔍 Bot username field:`, result.username);
        console.log(`🔍 Bot username length:`, result.username ? result.username.length : 'null/undefined');
      }
      
      // Only consider it a bot if there's actually a valid username in the result
      // Check if result exists AND has a username field AND it's not empty
      const isValidBot = !!(result && result.username && typeof result.username === 'string' && result.username.trim().length > 0);
      console.log(`🔍 Valid bot check result:`, isValidBot);
      
      resolve(isValidBot);
    });
  });
}

// Anti-Spam Configuration
const SPAM_CONFIG = {
  MIN_MESSAGE_LENGTH: 3,           // Minimum message length for points
  CHAT_POINTS_COOLDOWN: 10,        // Seconds between chat points
  MAX_MESSAGES_PER_MINUTE: 6,      // Max messages per minute to avoid spam
  MAX_CHAT_POINTS_PER_HOUR: 60,    // Max chat points per hour
  SPAM_DETECTION_WINDOW: 60        // Seconds to track for spam detection
};

// Helper function to check if user can receive chat points (anti-spam)
function canReceiveChatPoints(username) {
  return new Promise((resolve) => {
    const now = Date.now();
    const usernameLower = username.toLowerCase();
    
    // Check cooldown and message frequency
    db.get(`
      SELECT 
        last_message_ts,
        chat_points_last_hour,
        chat_points_hour_reset_ts,
        message_count
      FROM points 
      WHERE username = ?
    `, [usernameLower], (err, userData) => {
      if (err) {
        console.error('Error checking spam protection:', err);
        resolve(false);
        return;
      }
      
      if (!userData) {
        // New user, allow points
        resolve(true);
        return;
      }
      
      const timeSinceLastMessage = (now - userData.last_message_ts) / 1000;
      const hourResetTime = (now - userData.chat_points_hour_reset_ts) / 1000;
      
      // Check cooldown (minimum time between chat points)
      if (timeSinceLastMessage < SPAM_CONFIG.CHAT_POINTS_COOLDOWN) {
        console.log(`🚫 Spam protection: ${username} in cooldown (${Math.round(timeSinceLastMessage)}s/${SPAM_CONFIG.CHAT_POINTS_COOLDOWN}s)`);
        resolve(false);
        return;
      }
      
      // Check hourly limit (reset if hour has passed)
      let currentHourPoints = userData.chat_points_last_hour;
      if (hourResetTime >= 3600) {
        currentHourPoints = 0; // Reset hourly counter
      }
      
      if (currentHourPoints >= SPAM_CONFIG.MAX_CHAT_POINTS_PER_HOUR) {
        console.log(`🚫 Spam protection: ${username} hit hourly limit (${currentHourPoints}/${SPAM_CONFIG.MAX_CHAT_POINTS_PER_HOUR})`);
        resolve(false);
        return;
      }
      
      // Check recent message frequency
      db.get(`
        SELECT COUNT(*) as message_count 
        FROM spam_tracking 
        WHERE username = ? AND message_timestamp > ?
      `, [usernameLower, now - (SPAM_CONFIG.SPAM_DETECTION_WINDOW * 1000)], (err, recentMessages) => {
        if (err) {
          console.error('Error checking recent messages:', err);
          resolve(true); // Allow if error
          return;
        }
        
        if (recentMessages.message_count >= SPAM_CONFIG.MAX_MESSAGES_PER_MINUTE) {
          console.log(`🚫 Spam protection: ${username} too many messages (${recentMessages.message_count}/${SPAM_CONFIG.MAX_MESSAGES_PER_MINUTE})`);
          resolve(false);
          return;
        }
        
        resolve(true);
      });
    });
  });
}

// Helper function to record message for spam tracking
function recordMessageForSpamTracking(username, message) {
  const now = Date.now();
  const usernameLower = username.toLowerCase();
  
  // Insert into spam tracking
  db.run(`
    INSERT INTO spam_tracking (username, message_timestamp, message_length, created_at)
    VALUES (?, ?, ?, ?)
  `, [usernameLower, now, message.length, now], (err) => {
    if (err) {
      console.error('Error recording message for spam tracking:', err);
    }
  });
  
  // Clean up old spam tracking data (older than 1 hour)
  db.run(`
    DELETE FROM spam_tracking 
    WHERE message_timestamp < ?
  `, [now - 3600000], (err) => {
    if (err) {
      console.error('Error cleaning up spam tracking:', err);
    }
  });
}

// Helper function to update user's chat points tracking
function updateChatPointsTracking(username) {
  const now = Date.now();
  const usernameLower = username.toLowerCase();
  
  db.run(`
    UPDATE points 
    SET 
      last_message_ts = ?,
      message_count = message_count + 1,
      chat_points_last_hour = CASE 
        WHEN chat_points_hour_reset_ts < ? THEN 1
        ELSE chat_points_last_hour + 1
      END,
      chat_points_hour_reset_ts = CASE 
        WHEN chat_points_hour_reset_ts < ? THEN ?
        ELSE chat_points_hour_reset_ts
      END
    WHERE username = ?
  `, [now, now - 3600000, now - 3600000, now, usernameLower], (err) => {
    if (err) {
      console.error('Error updating chat points tracking:', err);
    }
  });
}

// Helper function to validate clip ownership
async function validateClipOwnership(clipUrl, username) {
  try {
    // Extract clip ID from URL
    const clipId = clipUrl.split('/').pop().split('?')[0];
    
    // Get clip info from Twitch API
    const response = await fetch(`https://api.twitch.tv/helix/clips?id=${clipId}`, {
      headers: {
        'Client-ID': config.twitchBotClientId,
        'Authorization': `Bearer ${config.twitchBotAccessToken}`
      }
    });
    
    if (!response.ok) {
      console.error('Error fetching clip info:', response.status);
      return false;
    }
    
    const data = await response.json();
    if (!data.data || data.data.length === 0) {
      return false;
    }
    
    const clip = data.data[0];
    const clipCreator = clip.creator_name.toLowerCase();
    const usernameLower = username.toLowerCase();
    
    return clipCreator === usernameLower;
  } catch (error) {
    console.error('Error validating clip ownership:', error);
    return false;
  }
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
      
      // Check for double points setting
      db.get('SELECT setting_value FROM settings WHERE setting_key = ?', ['double_points_enabled'], (err, row) => {
        if (err) {
          console.error('Error checking double points setting:', err);
        }
        
        let finalPoints = points;
        if (row && row.setting_value === 'true' && points > 0) {
          finalPoints = points * 2;
          console.log(`Double points active: ${points} → ${finalPoints} for ${username}`);
        }
        
        const oldPoints = user.points;
        const newPoints = oldPoints + finalPoints;
        
        // Log suspicious activity for large point increases
        if (finalPoints > 50) {
          logSuspiciousActivity(`Large point increase for ${username}`, {
            points: finalPoints,
            originalPoints: points,
            reason: reason,
            oldTotal: oldPoints,
            newTotal: newPoints,
            doublePointsActive: row && row.setting_value === 'true'
          });
        }
        
        updateUser(username, { points: newPoints }).then(() => {
          resolve(newPoints);
        }).catch(reject);
      });
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

// Bot Management API endpoints
app.get('/api/admin/bots', authenticateAdmin, (req, res) => {
  db.all('SELECT * FROM bot_blacklist ORDER BY added_at DESC', (err, bots) => {
    if (err) {
      console.error('Error fetching bots:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    console.log('🔍 API /api/admin/bots - Found bots:', bots);
    console.log('🔍 API /api/admin/bots - Bots count:', bots.length);
    res.json(bots);
  });
});

// Debug endpoint to check database directly
app.get('/api/admin/bots/debug', authenticateAdmin, (req, res) => {
  let results = {};
  let completed = 0;
  const totalQueries = 5;
  
  function checkComplete() {
    completed++;
    if (completed === totalQueries) {
      console.log('🔍 Debug - All results:', results);
      res.json({
        tableExists: results.tableCheck.length > 0,
        tableSchema: results.schema,
        allBots: results.allBots,
        emptyBots: results.emptyBots,
        validBots: results.validBots,
        counts: {
          total: results.allBots.length,
          empty: results.emptyBots.length,
          valid: results.validBots.length
        }
      });
    }
  }
  
  // Check if table exists
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='bot_blacklist'", (err, tableCheck) => {
    if (err) console.error('Error checking table:', err);
    results.tableCheck = tableCheck || [];
    console.log('🔍 Debug - Table exists:', tableCheck);
    checkComplete();
  });
  
  // Get table schema
  db.all("PRAGMA table_info(bot_blacklist)", (err, schema) => {
    if (err) console.error('Error getting schema:', err);
    results.schema = schema || [];
    console.log('🔍 Debug - Table schema:', schema);
    checkComplete();
  });
  
  // Get all bots
  db.all('SELECT * FROM bot_blacklist ORDER BY added_at DESC', (err, allBots) => {
    if (err) console.error('Error getting all bots:', err);
    results.allBots = allBots || [];
    console.log('🔍 Debug - All bots:', allBots);
    checkComplete();
  });
  
  // Get empty bots
  db.all('SELECT * FROM bot_blacklist WHERE username IS NULL OR username = "" OR TRIM(username) = ""', (err, emptyBots) => {
    if (err) console.error('Error getting empty bots:', err);
    results.emptyBots = emptyBots || [];
    console.log('🔍 Debug - Empty bots:', emptyBots);
    checkComplete();
  });
  
  // Get valid bots
  db.all('SELECT * FROM bot_blacklist WHERE username IS NOT NULL AND username != "" AND TRIM(username) != ""', (err, validBots) => {
    if (err) console.error('Error getting valid bots:', err);
    results.validBots = validBots || [];
    console.log('🔍 Debug - Valid bots:', validBots);
    checkComplete();
  });
});

// Test endpoint to add a bot manually
app.post('/api/admin/bots/test', authenticateAdmin, async (req, res) => {
  try {
    const testUsername = 'testbot_' + Date.now();
    const result = await db.run(
      'INSERT INTO bot_blacklist (username, added_by, added_at, reason) VALUES (?, ?, ?, ?)',
      [testUsername, 'admin', Math.floor(Date.now() / 1000), 'Test bot']
    );
    
    console.log('🔍 Test - Added bot:', testUsername, 'ID:', result.lastID);
    
    // Verify it was added
    const addedBot = await db.get('SELECT * FROM bot_blacklist WHERE id = ?', [result.lastID]);
    console.log('🔍 Test - Verified bot:', addedBot);
    
    res.json({
      success: true,
      botId: result.lastID,
      bot: addedBot
    });
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

app.post('/api/admin/bots', authenticateAdmin, async (req, res) => {
  try {
    const { username, reason } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const normalizedUsername = username.toLowerCase();
    const adminKey = req.headers['x-admin-key'] || req.query.admin_key;
    
    await db.run(
      'INSERT OR REPLACE INTO bot_blacklist (username, added_by, added_at, reason) VALUES (?, ?, ?, ?)',
      [normalizedUsername, 'admin', Date.now(), reason || 'Bot detected']
    );
    
    res.json({ success: true, message: 'Bot added to blacklist' });
  } catch (error) {
    console.error('Error adding bot:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/admin/bots/:username', authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const normalizedUsername = username.toLowerCase();
    
    await db.run('DELETE FROM bot_blacklist WHERE username = ?', [normalizedUsername]);
    
    res.json({ success: true, message: 'Bot removed from blacklist' });
  } catch (error) {
    console.error('Error removing bot:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// API endpoint to get approved clips (for public clip overview)
app.get('/api/clips/public', async (req, res) => {
  try {
    const { limit = 20, offset = 0, search } = req.query;
    
    let query = `
      SELECT c.*, c.display_name, c.submitter as username
      FROM clips c
      WHERE c.status = 'approved'
    `;
    
    const params = [];
    
    if (search) {
      query += ` AND (c.submitter LIKE ? OR c.display_name LIKE ? OR c.note LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    query += ` ORDER BY c.submitted_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    const clips = await db.all(query, params);
    
    // Also get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM clips WHERE status = 'approved'`;
    const countParams = [];
    
    if (search) {
      countQuery += ` AND (submitter LIKE ? OR display_name LIKE ? OR note LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    const result = await db.get(countQuery, countParams);
    
    res.json({
      clips,
      total: result.total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching public clips:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/clips/pending', authenticateAdmin, async (req, res) => {
  try {
    db.all(
      'SELECT id, submitter, display_name, clip_url, submitted_at, clip_id, note FROM clips WHERE status = ? ORDER BY submitted_at DESC',
      ['pending'],
      (err, rows) => {
        if (err) {
          console.error('Error fetching pending clips:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(rows); // Return array directly, not wrapped in object
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
    `redirect_uri=${encodeURIComponent('https://einfachsven.xyz/auth/twitch/callback')}&` +
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
      redirect_uri: 'https://einfachsven.xyz/auth/twitch/callback'
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
    console.log('API /api/leaderboard called');
    const topUsers = await getTopUsers(50);
    console.log('Found users:', topUsers.length);
    
    const response = {
      generated_at: Date.now(),
      top: topUsers.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        display_name: user.display_name,
        points: user.points
      }))
    };
    
    console.log('Sending response:', response);
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
  let userData = await getUser(username);
  if (!userData) {
    await createUser(username, displayName);
    userData = await getUser(username);
  }
  
  // Update last seen and message count
  await updateUser(username, {
    last_seen_ts: now,
    message_count: (userData.message_count || 0) + 1,
    display_name: displayName
  });
  
  // Record message for spam tracking
  recordMessageForSpamTracking(username, message);
  
  // Award chat points (with comprehensive anti-spam measures)
  const enableChatPoints = true;
  
  if (enableChatPoints) {
    // Check minimum message length
    if (message.length < SPAM_CONFIG.MIN_MESSAGE_LENGTH) {
      console.log(`🚫 Message too short for points: ${username} (${message.length} chars)`);
      return;
    }
    
    // Check if user is a bot
    const isBot = await isUserBot(username);
    if (isBot) {
      console.log(`🤖 Bot detected, ignoring chat points: ${username}`);
      return;
    }
    
    // Check if stream is live
    const streamLive = await isStreamLive();
    if (!streamLive) {
      console.log(`📺 Stream offline, no chat points for: ${username}`);
      return;
    }
    
    // Check comprehensive anti-spam protection
    const canReceivePoints = await canReceiveChatPoints(username);
    if (!canReceivePoints) {
      console.log(`🚫 Anti-spam protection blocked points for: ${username}`);
      return;
    }
    
    // Award chat points
    const newTotal = await addPointsToUser(username, config.pointsPerMessage, 'chat-message');
    console.log(`📝 Chat points: ${username} +${config.pointsPerMessage} (total: ${newTotal})`);
    
    // Update chat points tracking
    updateChatPointsTracking(username);
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
      
    case '!dice':
      sendChatMessage(`@${username} Spiele sind deaktiviert! Sammle Punkte durch aktive Stream-Teilnahme! 🎯`);
      break;
      
    case '!lottery':
      sendChatMessage(`@${username} Spiele sind deaktiviert! Sammle Punkte durch aktive Stream-Teilnahme! 🎯`);
      break;
      
    case '!rps':
      sendChatMessage(`@${username} Spiele sind deaktiviert! Sammle Punkte durch aktive Stream-Teilnahme! 🎯`);
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
      
      // Validate clip ownership
      const isOwner = await validateClipOwnership(clipUrl, username);
      if (!isOwner) {
        sendChatMessage( `@${username} Du kannst nur deine eigenen Clips einreichen!`);
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
      
    case '!botlist':
      if (!isAdmin) break;
      
      db.all('SELECT username, reason, added_at FROM bot_blacklist ORDER BY added_at DESC LIMIT 10', (err, rows) => {
        if (err) {
          console.error('Error fetching bot list:', err);
          return;
        }
        
        if (rows.length === 0) {
          sendChatMessage( `@${username} Keine Bots in der Blacklist.`);
        } else {
          const botsList = rows.map(bot => `${bot.username} (${bot.reason || 'Bot'})`).join(', ');
          sendChatMessage( `@${username} Bot Blacklist: ${botsList}`);
        }
      });
      break;
      
    case '!botremove':
      if (!isAdmin) break;
      
      if (args.length < 2) {
        sendChatMessage( `@${username} Usage: !botremove <username>`);
        break;
      }
      
      const botToRemove = args[1].toLowerCase();
      db.run('DELETE FROM bot_blacklist WHERE username = ?', [botToRemove], function(err) {
        if (err) {
          console.error('Error removing bot:', err);
          sendChatMessage( `@${username} Fehler beim Entfernen von ${botToRemove}!`);
          return;
        }
        
        if (this.changes > 0) {
          sendChatMessage( `@${username} ${botToRemove} wurde von der Bot-Blacklist entfernt!`);
        } else {
          sendChatMessage( `@${username} ${botToRemove} war nicht in der Blacklist.`);
        }
      });
      break;
      
    case '!botcheck':
      if (!isAdmin) break;
      
      if (args.length < 2) {
        sendChatMessage( `@${username} Usage: !botcheck <username>`);
        break;
      }
      
      const userToCheck = args[1].toLowerCase();
      db.get('SELECT * FROM bot_blacklist WHERE username = ?', [userToCheck], (err, row) => {
        if (err) {
          console.error('Error checking bot status:', err);
          sendChatMessage( `@${username} Fehler beim Überprüfen von ${userToCheck}!`);
          return;
        }
        
        if (row) {
          sendChatMessage( `@${username} ${userToCheck} ist in der Bot-Blacklist (Grund: ${row.reason || 'Bot'})`);
        } else {
          sendChatMessage( `@${username} ${userToCheck} ist NICHT in der Bot-Blacklist`);
        }
       });
       break;
       
     case '!botdebug':
       if (!isAdmin) break;
       
       db.all('SELECT * FROM bot_blacklist ORDER BY added_at DESC', (err, allBots) => {
         if (err) {
           console.error('Error getting all bots:', err);
           sendChatMessage( `@${username} Fehler beim Abrufen der Bot-Liste!`);
           return;
         }
         
         const botList = allBots.map(bot => `${bot.username} (${bot.reason})`).join(', ');
         sendChatMessage( `@${username} Alle Bots in DB: ${botList || 'Keine'}`);
         
         const currentUserInList = allBots.find(bot => bot.username === username.toLowerCase());
         if (currentUserInList) {
           sendChatMessage( `@${username} Du bist in der Liste: ${currentUserInList.username} (${currentUserInList.reason})`);
         } else {
           sendChatMessage( `@${username} Du bist NICHT in der Bot-Liste!`);
         }
       });
       break;
       
     case '!botfix':
       if (!isAdmin) break;
       
       const botUsername = username.toLowerCase();
       db.run('DELETE FROM bot_blacklist WHERE username = ?', [botUsername], function(err) {
         if (err) {
           console.error('Error removing bot:', err);
           sendChatMessage( `@${username} Fehler beim Entfernen von ${botUsername}!`);
           return;
         }
         
         if (this.changes > 0) {
           sendChatMessage( `@${username} ${botUsername} wurde von der Bot-Blacklist entfernt! (${this.changes} Einträge entfernt)`);
         } else {
           sendChatMessage( `@${username} ${botUsername} war nicht in der Blacklist.`);
         }
       });
       break;
       
     case '!botremove':
       if (!isAdmin) break;
       
       if (args.length < 2) {
         sendChatMessage( `@${username} Usage: !botremove <username>`);
         break;
       }
       
       const userToRemove = args[1].toLowerCase();
       db.run('DELETE FROM bot_blacklist WHERE username = ?', [userToRemove], function(err) {
         if (err) {
           console.error('Error removing bot:', err);
           sendChatMessage( `@${username} Fehler beim Entfernen von ${userToRemove}!`);
           return;
         }
         
         if (this.changes > 0) {
           sendChatMessage( `@${username} ${userToRemove} wurde von der Bot-Blacklist entfernt! (${this.changes} Einträge entfernt)`);
         } else {
           sendChatMessage( `@${username} ${userToRemove} war nicht in der Blacklist.`);
         }
       });
       break;
       
     case '!botclean':
       if (!isAdmin) break;
       
       // Remove empty or invalid entries from bot blacklist
       db.run('DELETE FROM bot_blacklist WHERE username IS NULL OR username = "" OR TRIM(username) = ""', function(err) {
         if (err) {
           console.error('Error cleaning bot blacklist:', err);
           sendChatMessage( `@${username} Fehler beim Bereinigen der Bot-Liste!`);
           return;
         }
         
      sendChatMessage( `@${username} Bot-Liste bereinigt! ${this.changes} leere Einträge entfernt.`);
      });
      break;
      
    case '!spamconfig':
      if (!isAdmin) break;
      
      sendChatMessage(`@${username} Anti-Spam Config: Min ${SPAM_CONFIG.MIN_MESSAGE_LENGTH} chars, ${SPAM_CONFIG.CHAT_POINTS_COOLDOWN}s cooldown, max ${SPAM_CONFIG.MAX_MESSAGES_PER_MINUTE} msgs/min, max ${SPAM_CONFIG.MAX_CHAT_POINTS_PER_HOUR} pts/hour`);
      break;
      
    case '!streamconfig':
      if (!isAdmin) break;
      
      const streamStatus = await isStreamLive();
      sendChatMessage(`@${username} Stream Config: Offline check ${config.streamOfflineCheck ? 'ENABLED' : 'DISABLED'}, Current status: ${streamStatus ? 'LIVE' : 'OFFLINE'}`);
      break;
      
    case '!spamcheck':
      if (!isAdmin) break;
      
      const checkUsername = args[1];
      if (!checkUsername) {
        sendChatMessage(`@${username} Usage: !spamcheck <username>`);
        break;
      }
      
      const canReceive = await canReceiveChatPoints(checkUsername);
      const userData = await getUser(checkUsername);
      
      if (!userData) {
        sendChatMessage(`@${username} User ${checkUsername} nicht gefunden!`);
        break;
      }
      
      const timeSinceLast = (Date.now() - userData.last_message_ts) / 1000;
      const cooldownRemaining = Math.max(0, SPAM_CONFIG.CHAT_POINTS_COOLDOWN - timeSinceLast);
      
      sendChatMessage(`@${username} ${checkUsername}: Can receive points: ${canReceive}, Cooldown: ${Math.round(cooldownRemaining)}s, Hourly pts: ${userData.chat_points_last_hour}/${SPAM_CONFIG.MAX_CHAT_POINTS_PER_HOUR}`);
      break;
      
    case '!spamreset':
      if (!isAdmin) break;
      
      const resetUsername = args[1];
      if (!resetUsername) {
        sendChatMessage(`@${username} Usage: !spamreset <username>`);
        break;
      }
      
      const now = Date.now();
      db.run(`
        UPDATE points 
        SET 
          last_message_ts = 0,
          chat_points_last_hour = 0,
          chat_points_hour_reset_ts = ?
        WHERE username = ?
      `, [now, resetUsername.toLowerCase()], (err) => {
        if (err) {
          console.error('Error resetting spam data:', err);
          sendChatMessage(`@${username} Fehler beim Reset der Spam-Daten für ${resetUsername}!`);
          return;
        }
        
        sendChatMessage(`@${username} Spam-Daten für ${resetUsername} zurückgesetzt!`);
      });
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
      
    case '!doublepoints':
      if (!isAdmin) {
        sendChatMessage( `@${username} Nur Admins können das!`);
        break;
      }
      
      // Toggle double points
      db.get('SELECT setting_value FROM settings WHERE setting_key = ?', ['double_points_enabled'], (err, row) => {
        if (err) {
          console.error('Error checking double points setting:', err);
          return;
        }
        
        const isEnabled = row ? row.setting_value === 'true' : false;
        const newValue = !isEnabled;
        
        db.run('INSERT OR REPLACE INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)', 
          ['double_points_enabled', newValue.toString(), getCurrentTimestamp()], (err) => {
          if (err) {
            console.error('Error updating double points setting:', err);
            return;
          }
          
          if (newValue) {
            sendChatMessage(`🎉 Doppelte Punkte sind EINGESCHALTET! Alle Punkte werden verdoppelt!`);
          } else {
            sendChatMessage(`❌ Doppelte Punkte sind AUSGESCHALTET.`);
          }
        });
      });
      break;
      
    case '!drawlottery':
      sendChatMessage(`@${username} Lotterie ist deaktiviert! Sammle Punkte durch aktive Stream-Teilnahme! 🎯`);
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

// Enhanced viewtime tracking - checks both chat activity and viewer list
async function updateViewtime() {
  const enableViewtimePoints = true; // Set to true to enable viewtime points
  
  if (!enableViewtimePoints) {
    return; // Skip viewtime tracking for testing
  }
  
  // Check if stream is live before giving viewtime points
  const streamLive = await isStreamLive();
  if (!streamLive) {
    console.log('📺 Stream offline, skipping viewtime tracking');
    return;
  }
  
  try {
    // Get users who have been active in chat (written at least once)
    const chatActiveUsers = await getChatActiveUsers();
    
    // Get current viewers from Twitch API
    const currentViewers = await getCurrentViewers();
    
    // Only track viewtime for users who:
    // 1. Have written in chat at least once
    // 2. Are currently in the viewer list
    // This ensures 100% accuracy - no guessing!
    const eligibleUsers = chatActiveUsers.filter(user => 
      currentViewers.includes(user.username.toLowerCase())
    );
    
    console.log(`Tracking viewtime for ${eligibleUsers.length} users (${currentViewers.length} total viewers, ${chatActiveUsers.length} chat-active users)`);
    
    // If no viewers found, don't track anything (safer approach)
    if (currentViewers.length === 0) {
      console.log('No viewers found via API - skipping viewtime tracking for safety');
      return;
    }
    
    for (const user of eligibleUsers) {
      const newViewSeconds = user.view_seconds + config.heartbeatSeconds;
      let pointsToAdd = 0;
      let remainingViewSeconds = newViewSeconds;
      
      // Calculate points from viewtime
      while (remainingViewSeconds >= config.viewtimeSecondsPerPoint) {
        pointsToAdd += 1;
        remainingViewSeconds -= config.viewtimeSecondsPerPoint;
      }
      
      // Check if user is a bot before giving viewtime points
      const isBot = await isUserBot(user.username);
      if (isBot) {
        console.log(`🤖 Bot detected, skipping viewtime: ${user.username}`);
        continue;
      }
      
      // Update user with new viewtime and points
      if (pointsToAdd > 0) {
        await addPointsToUser(user.username, pointsToAdd, 'viewtime');
        console.log(`👀 Viewtime: ${user.username} +${pointsToAdd} (stream live: ${streamLive})`);
      }
      
      await updateUser(user.username, { view_seconds: remainingViewSeconds });
    }
  } catch (error) {
    console.error('Error updating viewtime:', error);
  }
}

// Get users who have been active in chat
async function getChatActiveUsers() {
  return new Promise((resolve, reject) => {
    const timeout = getCurrentTimestamp() - config.presenceTimeoutSeconds;
    
    db.all('SELECT * FROM points WHERE last_seen_ts > ? AND message_count > 0', [timeout], (err, users) => {
      if (err) {
        reject(err);
      } else {
        resolve(users);
      }
    });
  });
}

// Get current viewers from Twitch API
async function getCurrentViewers() {
  try {
    // Use Twitch Helix API to get current viewers with Bot Client ID
    const response = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${config.channel}`, {
      headers: {
        'Client-ID': config.twitchBotClientId,
        'Authorization': `Bearer ${config.botOauth.substring(6)}`
      }
    });
    
    if (response.data.data.length === 0) {
      console.log('Stream is offline, no viewers to track');
      return [];
    }
    
    const streamId = response.data.data[0].id;
    
    // Get chatters (viewers)
    const chattersResponse = await axios.get(`https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${streamId}&moderator_id=${streamId}`, {
      headers: {
        'Client-ID': config.twitchBotClientId,
        'Authorization': `Bearer ${config.botOauth.substring(6)}`
      }
    });
    
    const viewers = chattersResponse.data.data.map(chatter => chatter.user_login);
    console.log(`Found ${viewers.length} current viewers using Bot Client ID`);
    
    return viewers;
  } catch (error) {
    console.error('Error fetching current viewers:', error);
    console.log('Cannot track viewtime without viewer list - API error');
    // Return empty array to skip viewtime tracking for safety
    return [];
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
  
  // Try to use Twitch API first (for Chat Bot Badge)
  if (config.twitchBotAppAccessToken && config.twitchBotAppClientId) {
    const success = await sendChatMessageViaAPI(message);
    if (success) {
      console.log('✅ Chat message sent via API (Bot Badge enabled)');
      return true;
    }
  }
  
  // Fallback to IRC if API fails or not configured
  try {
    console.log('🔍 Sending message to channel via IRC:', config.channel);
    await chatClient.say(config.channel, message);
    console.log('✅ Message sent successfully via IRC');
    return true;
  } catch (error) {
    console.log('❌ Failed to send message via IRC:', error.message);
    console.log('❌ Error details:', error);
    return false;
  }
}

// Send chat message via Twitch API (enables Chat Bot Badge)
async function sendChatMessageViaAPI(message) {
  try {
    // Get broadcaster ID
    const broadcasterResponse = await fetch(`https://api.twitch.tv/helix/users?login=${config.channel}`, {
      headers: {
        'Client-ID': config.twitchBotAppClientId,
        'Authorization': `Bearer ${config.twitchBotAppAccessToken}`
      }
    });
    
    if (!broadcasterResponse.ok) {
      console.error('❌ Failed to get broadcaster ID:', broadcasterResponse.status);
      return false;
    }
    
    const broadcasterData = await broadcasterResponse.json();
    if (!broadcasterData.data || broadcasterData.data.length === 0) {
      console.error('❌ Broadcaster not found');
      return false;
    }
    
    const broadcasterId = broadcasterData.data[0].id;
    
    // Get bot user ID
    const botResponse = await fetch(`https://api.twitch.tv/helix/users?login=${config.botUsername}`, {
      headers: {
        'Client-ID': config.twitchBotAppClientId,
        'Authorization': `Bearer ${config.twitchBotAppAccessToken}`
      }
    });
    
    if (!botResponse.ok) {
      console.error('❌ Failed to get bot user ID:', botResponse.status);
      return false;
    }
    
    const botData = await botResponse.json();
    if (!botData.data || botData.data.length === 0) {
      console.error('❌ Bot user not found');
      return false;
    }
    
    const botUserId = botData.data[0].id;
    
    // Send chat message via API
    const chatResponse = await fetch(`https://api.twitch.tv/helix/chat/messages`, {
      method: 'POST',
      headers: {
        'Client-ID': config.twitchBotAppClientId,
        'Authorization': `Bearer ${config.twitchBotAppAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        broadcaster_id: broadcasterId,
        sender_id: botUserId, // Bot user ID (not broadcaster ID!)
        message: message
      })
    });
    
    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      console.error('❌ Failed to send chat message via API:', chatResponse.status, errorText);
      return false;
    }
    
    console.log('✅ Chat message sent via API successfully with bot user ID:', botUserId);
    return true;
  } catch (error) {
    console.error('❌ Error sending chat message via API:', error);
    return false;
  }
}

// Event handlers
chatClient.onMessage(async (channel, user, text, msg) => {
  await handleChatMessage({ channel, user, message: text, msg });
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
