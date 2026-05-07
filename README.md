# Vibecode Studio

A standalone local web IDE for the Vibecode AI coding platform. No terminal interaction required — everything through the browser.

## Requirements

- [Bun](https://bun.sh) runtime
- [vibecode-cli](https://vibecode.com) installed globally
- Node.js 18+ (for the launcher)

## Quick Start

```bash
node start.js
```

Flags:
- `--dev` — Run in development mode with hot reload (Vite on :5173)
- `--no-open` — Don't auto-open the browser
- `--port 3847` — Override the server port

## Manual Start

```bash
# Install deps
bun install

# Development (hot reload)
bun run dev

# Production build + serve
bun run build
bun run start
```

## Data locations

| Item | Path |
|------|------|
| Config | `~/.config/vibecode-studio/config.json` |
| Database | `~/.local/share/vibecode-studio/data.db` |
| Backups | `~/.local/share/vibecode-studio/backups/` |
| Auth | `~/.local/share/vibecode-studio/auth.json` |

## Architecture

```
vibecode-studio/
  server/           Hono backend (Bun runtime)
    cli/            vibecode-cli subprocess wrapper
    ssh/            SSH connection + file + tunnel manager
    backup/         Backup coordinator
    state/          SQLite DB, config, auth
    ws/             WebSocket hub
    routes/         REST API routes
  client/src/       React 19 frontend (Vite)
    pages/          Login, Dashboard, Workspace, Settings
    components/     UI, workspace panels, dialogs, chat
    store/          Zustand state
    hooks/          Data hooks
    lib/            API client, WS, utils
```
