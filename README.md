# Vibecode Studio

Vibecode Studio is a local, browser-based IDE for Vibecode AI workflows. It combines a Bun/Hono backend with a React frontend so you can manage Vibecode projects, chat with coding agents, edit files, and run remote sandbox tooling from a single web app.

**Release:** `v0.1.0`

---

## Project overview

Vibecode Studio provides a full local control plane for AI-assisted development:

- Connect to Vibecode projects through `vibecode-cli`
- Run chat sessions with streaming assistant responses
- Browse and edit project files in Monaco
- Use integrated SSH terminal access
- Preview remote apps through tunnel-based preview routes
- Persist project/session state locally in SQLite
- Manage backups, continuation snapshots, and local settings

The app is designed to run on your machine and store runtime state in user-scoped config/data directories.

---

## Core Architecture: The Continuation Logic

**The continuation logic is the most important part of the whole program.**

In a modern AI-assisted development environment, Large Language Models frequently encounter token limits, network timeouts, or arbitrary truncation. When an LLM is cut off, the system must never pollute the context window or the underlying database with synthetic, fake user prompts like *'Please continue your response'*.

Instead, this system operates on a state-of-the-art, invisible stitching architecture. When the frontend issues a continuation flag, the backend re-invokes the model with the exact previous context. Crucially, the subsequent stream of tokens is **appended directly** to the existing database entity and seamlessly stitched into the React UI. This creates an unbroken, contiguous, magical scrolling experience for the user. The AI agent operates in a persistent background context—meaning page reloads, tab closures, and network drops never result in lost generation data. The in-memory stream registry constantly buffers output so that any reconnected client instantly synchronizes with the live generation.

---

## Architecture summary

### Server layer (`server/`)

- **Runtime/framework:** Bun + Hono
- **Responsibilities:**
  - REST APIs (`/api/auth`, `/api/projects`, `/api/chat`, `/api/files`, `/api/backups`, `/api/preview`, `/api/terminal`, `/api/settings`, `/api/continuation`)
  - WebSocket hubs for project events, logs, and terminal streams
  - SSH connection management and file watching
  - Vibecode CLI orchestration
  - SQLite persistence and config/auth state management

### Client layer (`client/src/`)

- **Runtime/framework:** React 19 + Vite + TypeScript
- **Responsibilities:**
  - Workspace UI (dashboard, project workspace, settings, login)
  - Monaco editor integration
  - Chat panel and session history UI
  - File tree, terminal panel, preview panel
  - Local app state management via Zustand
  - API/WebSocket client coordination

### High-level layout

```text
vibecode-studio/
├── server/
│   ├── routes/      # REST routes
│   ├── ssh/         # SSH + file/tunnel management
│   ├── cli/         # vibecode-cli wrapper
│   ├── state/       # SQLite, config, auth, stream registry
│   ├── backup/      # Backup coordination
│   └── ws/          # WebSocket hub
├── client/src/
│   ├── pages/       # Login, Dashboard, Workspace, Settings
│   ├── components/  # Editor, chat, panels, dialogs, terminal UI
│   ├── store/       # Zustand stores
│   ├── hooks/       # UI/data hooks
│   └── lib/         # API and WebSocket clients
└── start.js         # local launcher and preflight script
```

---

## Setup / install

### Prerequisites

- [Bun](https://bun.sh) (required)
- Node.js 18+ (used by `start.js` launcher)
- `vibecode-cli` installed and available on `PATH` (required for full project/chat workflows)

### Install dependencies

```bash
bun install
```

---

## Run, dev, and build commands

### Recommended launcher

```bash
node start.js
```

Launcher options:

- `--dev` — run server and Vite dev client with hot reload
- `--no-open` — do not auto-open browser
- `--port <number>` — override server port (default `3847`)

### Package scripts

```bash
# Full development mode (server + Vite)
bun run dev

# Build client + server bundle
bun run build

# Start production server (expects dist artifacts)
bun run start

# Preview built client with Vite
bun run preview
```

---

## Configuration and data paths

Default filesystem locations:

| Item | Default path |
|---|---|
| Config file | `~/.config/vibecode-studio/config.json` |
| App data directory | `~/.local/share/vibecode-studio/` |
| SQLite database | `~/.local/share/vibecode-studio/data.db` |
| Auth store | `~/.local/share/vibecode-studio/auth.json` |
| Backups | `~/.local/share/vibecode-studio/backups/` |

Supported environment overrides:

- `VS_CONFIG_PATH` — set explicit config file path
- `VS_PORT` — override server port
- `VS_NO_OPEN=1` — disable browser auto-open
- `VS_DEBUG=1` — enable debug mode
- `VS_CLI_PATH` — custom `vibecode-cli` binary path

---

## Key features

- Vibecode project listing/create/delete via CLI integration
- AI chat with streaming updates and message history
- Monaco editor with configurable preferences
- SSH-backed file operations and terminal streaming
- Live file-change events over WebSockets
- Remote preview/tunnel APIs for sandbox web apps
- Automatic and manual backup workflows
- Continuation/session restore support
- Local settings and credit display preferences

---

## Known constraints

- **Bun is mandatory** for backend runtime (`bun:sqlite`, `Bun.serve`).
- **Single-user local app model**: state is stored in per-user local directories (not multi-tenant).
- **Remote features depend on Vibecode + SSH availability**: chat/project/file/terminal actions require valid remote access.
- **Stored auth is machine/user bound**: encrypted auth data is derived from local host/user context and is not intended for cross-machine portability.
- **Launcher assumptions are Unix-leaning** for some process/port utilities.

---

## Program planning docs

- [Master tranche execution plan](docs/tranche-execution-plan.md)
- [Release gates + 200-case validation matrix](docs/release-gates.md)
- [Rollback runbook](docs/rollback-runbook.md)

---

## Changelog

### v0.1.0 (2026-05-08)

Initial v0.1 release preparation for the rewritten codebase:

- refreshed project documentation and architecture notes
- aligned package/runtime visible version strings to `0.1.0`
- documented setup, commands, config paths, feature set, and operational constraints
