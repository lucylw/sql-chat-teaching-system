module.exports = {
  apps: [
    {
      name: "sql-chat-c-spr26",
      script: "src/server.js",
      cwd: __dirname + "/../..",
      env_file: __dirname + "/../../.env",
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production"
      },
      autorestart: true,
      watch: false
    }
  ]
};
