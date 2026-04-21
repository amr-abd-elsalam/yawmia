// ═══════════════════════════════════════════════════════════════
// ecosystem.config.cjs — PM2 Process Manager Configuration
// ═══════════════════════════════════════════════════════════════
// Usage: pm2 start ecosystem.config.cjs --env production
// Note: CommonJS format required — PM2 does not support ESM config
// ═══════════════════════════════════════════════════════════════

module.exports = {
  apps: [{
    name: 'yawmia',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      PORT: 3002,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3002,
    },
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000,
  }],
};
