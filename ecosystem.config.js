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
    time: true,
    // Restart bei Crash
    max_restarts: 10,
    min_uptime: '10s',
    // Memory monitoring
    node_args: '--max-old-space-size=1024'
  }]
};
