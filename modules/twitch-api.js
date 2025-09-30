/**
 * Optional Twitch API validation module
 * Validates clips using Twitch Helix API
 * Disabled by default - set ENABLE_EVENTSUB=true in .env to enable
 */

const https = require('https');

class TwitchAPIValidator {
  constructor(config) {
    this.clientId = config.twitchClientId;
    this.clientSecret = config.twitchClientSecret;
    this.channelId = config.channelId; // You'll need to get this from the channel name
    this.accessToken = null;
    this.tokenExpiry = null;
    this.enabled = config.enableEventSub;
    
    if (this.enabled && (!this.clientId || !this.clientSecret)) {
      console.warn('Twitch API validation enabled but missing CLIENT_ID or CLIENT_SECRET');
      this.enabled = false;
    }
  }
  
  /**
   * Get app access token for Twitch API
   */
  async getAppAccessToken() {
    if (!this.enabled) return null;
    
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }
    
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials'
      });
      
      const options = {
        hostname: 'id.twitch.tv',
        port: 443,
        path: '/oauth2/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (response.access_token) {
              this.accessToken = response.access_token;
              // Set expiry with 5 minute buffer
              this.tokenExpiry = Date.now() + (response.expires_in - 300) * 1000;
              resolve(this.accessToken);
            } else {
              reject(new Error('Failed to get access token: ' + data));
            }
          } catch (error) {
            reject(new Error('Invalid response from Twitch: ' + data));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.write(postData);
      req.end();
    });
  }
  
  /**
   * Get channel ID from channel name
   */
  async getChannelId(channelName) {
    if (!this.enabled) return null;
    
    const token = await this.getAppAccessToken();
    if (!token) return null;
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.twitch.tv',
        port: 443,
        path: `/helix/users?login=${channelName}`,
        method: 'GET',
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${token}`
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (response.data && response.data.length > 0) {
              resolve(response.data[0].id);
            } else {
              reject(new Error('Channel not found'));
            }
          } catch (error) {
            reject(new Error('Invalid response from Twitch: ' + data));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.end();
    });
  }
  
  /**
   * Validate a clip using Twitch Helix API
   */
  async validateClip(clipUrl) {
    if (!this.enabled) {
      return { valid: true, reason: 'API validation disabled' };
    }
    
    try {
      const clipId = this.extractClipId(clipUrl);
      if (!clipId) {
        return { valid: false, reason: 'Invalid clip URL format' };
      }
      
      const token = await this.getAppAccessToken();
      if (!token) {
        console.warn('Failed to get access token, skipping clip validation');
        return { valid: true, reason: 'API unavailable' };
      }
      
      // Get channel ID if not cached
      if (!this.channelId) {
        this.channelId = await this.getChannelId(config.channel);
      }
      
      const clipData = await this.getClipData(clipId, token);
      if (!clipData) {
        return { valid: false, reason: 'Clip not found' };
      }
      
      // Validate clip belongs to the correct channel
      if (clipData.broadcaster_id !== this.channelId) {
        return { valid: false, reason: 'Clip does not belong to this channel' };
      }
      
      // Validate clip duration (max 60 seconds for highlights)
      if (clipData.duration > 60) {
        return { valid: false, reason: 'Clip too long (max 60 seconds)' };
      }
      
      // Validate clip is not too old (max 90 days)
      const clipDate = new Date(clipData.created_at);
      const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds
      if (Date.now() - clipDate.getTime() > maxAge) {
        return { valid: false, reason: 'Clip too old (max 90 days)' };
      }
      
      return {
        valid: true,
        reason: 'Valid clip',
        data: {
          id: clipData.id,
          title: clipData.title,
          duration: clipData.duration,
          view_count: clipData.view_count,
          created_at: clipData.created_at,
          thumbnail_url: clipData.thumbnail_url
        }
      };
      
    } catch (error) {
      console.error('Error validating clip:', error);
      return { valid: false, reason: 'Validation error: ' + error.message };
    }
  }
  
  /**
   * Get clip data from Twitch API
   */
  async getClipData(clipId, token) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.twitch.tv',
        port: 443,
        path: `/helix/clips?id=${clipId}`,
        method: 'GET',
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${token}`
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (response.data && response.data.length > 0) {
              resolve(response.data[0]);
            } else {
              resolve(null);
            }
          } catch (error) {
            reject(new Error('Invalid response from Twitch: ' + data));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.end();
    });
  }
  
  /**
   * Extract clip ID from various Twitch clip URL formats
   */
  extractClipId(url) {
    // Handle different URL formats:
    // https://clips.twitch.tv/ClipName
    // https://www.twitch.tv/channel/clip/ClipName
    // https://clips.twitch.tv/embed?clip=ClipName
    
    const patterns = [
      /\/clips\.twitch\.tv\/([^\/\?]+)/,
      /\/clip\/([^\/\?]+)/,
      /[?&]clip=([^&]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  }
  
  /**
   * Get user information for a username
   */
  async getUserInfo(username) {
    if (!this.enabled) return null;
    
    const token = await this.getAppAccessToken();
    if (!token) return null;
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.twitch.tv',
        port: 443,
        path: `/helix/users?login=${username}`,
        method: 'GET',
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${token}`
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (response.data && response.data.length > 0) {
              resolve(response.data[0]);
            } else {
              resolve(null);
            }
          } catch (error) {
            reject(new Error('Invalid response from Twitch: ' + data));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.end();
    });
  }
}

module.exports = TwitchAPIValidator;
