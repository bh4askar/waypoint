# Azure F1 Free deployment

Live demo: https://waypoint-bhaskar-20261121.azurewebsites.net/

The current deployment runs Node.js 24 LTS on Azure App Service Linux F1 Free in Central India. It reuses the existing `cloudshield-dashboard-f1` plan. Waypoint added no paid Azure resources or paid AI APIs. F1 has a 60 CPU minute daily quota, 1 GB memory and 1 GB storage; inactivity can unload the app. It is suitable for a portfolio demo, with cold starts and quota limits.

## Prepare a source clone

Node.js 22+ and `tar` are required. On Ubuntu x64, `dpkg-deb` is also required. Windows 11 x64 can prepare the Linux runtime without running it:

```sh
npm ci
npm run setup-ai -- --linux --runtime-only
npm test
```

This downloads the pinned llama.cpp b12359 Ubuntu runtime and a SHA256-verified libgomp Ubuntu package. Generated `native/` is ignored by Git. Include `native/` in the deployment ZIP. Credits and runtime licence details are under `licenses/`. Model weights remain excluded from Git and the deployment ZIP; startup downloads Qwen3 0.6B Q4_K_M once to persistent storage.

ZIP the project contents at the archive root: `server.mjs`, `package.json`, `lib/`, `public/`, `scripts/`, `native/`, `node_modules/` and `licenses/`. Prepare `node_modules/` for Linux x64 (glibc) so Sharp can load its correct native package. Exclude `.git/`, `.env`, `data/`, `.seed/`, archives and private account data. A plain GitHub ZIP needs the runtime preparation step before Azure deployment.

## Existing app configuration

Startup command: `bash /home/site/wwwroot/scripts/azure-start.sh`.

Set these as Azure app settings, preserving existing Google credentials:

| Setting | Value |
| --- | --- |
| `APP_URL` | `https://waypoint-bhaskar-20261121.azurewebsites.net` |
| `HOST` | `0.0.0.0` |
| `WAYPOINT_DATA_DIR` | `/home/waypoint-data` |
| `WAYPOINT_CHAT_THREADS` | `1` |
| `WAYPOINT_CHAT_CONTEXT` | `1024` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Secret app settings; never commit |

Use the platform's `PORT`. Keep `/home/waypoint-data` persistent and backed up. It contains account trips, media caches and the model. Sessions are in memory, so restarts require another sign-in. Do not enable `WEBSITE_RUN_FROM_PACKAGE=1` with this deployment arrangement.

```sh
az webapp deploy --resource-group waypoint-free --name waypoint-bhaskar-20261121 --src-path package.zip --type zip
```

The registered OAuth callback is the live app URL plus `/auth/google/callback`. Google consent remains in testing mode, so approved test accounts can sign in. Register a new callback and configure your own credentials if deploying a separate copy. Keep the app on F1 to retain the free hosting plan; other Azure services and upgraded tiers have separate charges.
