module.exports = {
  apps: [
    {
      name: "crm-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
    {
      name: "crm-worker",
      cwd: __dirname,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "--env-file=.env.local src/workers/all.ts",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
  ],
};
