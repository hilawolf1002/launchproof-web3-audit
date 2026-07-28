module.exports = {
  apps: [{
    name: 'launchproof',
    script: 'server.js',
    cwd: '/home/lior0334/MAKE_MONEY',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      PORT: 8899,
      NODE_ENV: 'production',
    },
    error_file: '/home/lior0334/MAKE_MONEY/logs/err.log',
    out_file: '/home/lior0334/MAKE_MONEY/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
