# Telegram Copilot Bridge — Design Spec

**Date:** 2026-05-02
**Status:** Approved
**Approach:** PTY Bridge (Approach A)

## Problem Statement

Interact with GitHub Copilot CLI and the local terminal remotely via a Telegram bot. The bot runs on a single machine for a single user and provides:

- Live connection to running Copilot CLI sessions via pseudo-terminal
- Raw shell command execution
- Browsable and searchable Copilot session history
- Real-time notifications of session activity
- Authentication via Telegram user ID whitelist

## Architecture

```
┌─────────────┐     HTTPS/Polling      ┌──────────────────┐
│  Telegram    │◄──────────────────────►│  Bot Server      │
│  (phone)     │                        │  (grammy)        │
└─────────────┘                        └────────┬─────────┘
                                                │
                              ┌─────────────────┼─────────────────┐
                              │                 │                 │
                        ┌─────▼─────┐    ┌──────▼──────┐   ┌─────▼──────┐
                        │ PTY Manager│    │Session Store │   │ Notification│
                        │ (node-pty) │    │ Reader      │   │ Watcher     │
                        └─────┬─────┘    │(better-sqlite)│  │(DB polling) │
                              │          └──────────────┘   └────────────┘
                        ┌─────▼─────┐
                        │ Terminal   │
                        │ Sessions   │
                        │ (copilot,  │
                        │  bash, etc)│
                        └───────────┘
```

Three core modules:

1. **PTY Manager** — spawns and manages pseudo-terminal sessions for both Copilot CLI and raw shell commands. Buffers output, strips ANSI codes, chunks long responses for Telegram's 4096-char message limit.
2. **Session Store Reader** — reads the Copilot session store SQLite DB in read-only mode for history browsing and full-text search via FTS5.
3. **Notification Watcher** — polls the session store DB every 30 seconds for new activity and pushes formatted updates to Telegram.

## Bot Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Welcome message, verify auth | `/start` |
| `/copilot <prompt>` | Send prompt to Copilot CLI PTY session | `/copilot fix the auth bug in login.ts` |
| `/shell <cmd>` | Run a raw shell command | `/shell git status` |
| `/sessions` | List recent Copilot sessions (last 10) | `/sessions` |
| `/search <query>` | Full-text search past sessions | `/search authentication bug` |
| `/session <id>` | View details of a specific session | `/session abc-123` |
| `/status` | Show active PTY sessions and bot health | `/status` |
| `/kill` | Terminate the active PTY session | `/kill` |
| `/cwd <path>` | Change working directory for new sessions | `/cwd ~/projects/myapp` |
| `/notify on\|off` | Toggle real-time session notifications | `/notify on` |

**Non-command messages:** Plain text without a `/` prefix is sent as input to the active Copilot PTY session (conversational mode).

### Output Handling

- Short outputs (<4096 chars) → single Telegram message with monospace formatting
- Long outputs → split into chunks, sent as multiple messages
- Very long outputs (>20K chars) → truncated with "showing last N lines" + option to get full output as a file attachment

## PTY Manager

### Session Lifecycle

```
User sends /copilot "fix bug"
        │
        ▼
  Is there an active Copilot PTY?
        │
   No ──┤── Yes
   │         │
   ▼         ▼
  Spawn new  Send "fix bug" as
  PTY with   input to existing
  `copilot`  PTY session
  command
        │
        ▼
  PTY output events fire → buffer 500ms → strip ANSI → chunk → send to Telegram
```

### Key Behaviors

- **One active PTY per type** — one for Copilot CLI, one for shell. Prevents confusion.
- **Auto-timeout** — PTY sessions idle for 30 minutes are killed with a notification sent to the user.
- **Output buffering** — 500ms debounce window to batch streaming output and avoid Telegram rate limits (30 messages/sec).
- **Working directory** — persisted across sessions via `/cwd`. Defaults to `$DEFAULT_CWD`.
- **Shell commands** — each `/shell` invocation spawns a fresh PTY (execute, capture, close). No persistent shell state between calls.

### Error Handling

- PTY spawn failure → Telegram message with error details
- PTY crash/exit → notification with exit code
- Telegram API rate limit → exponential backoff message queue

## Session Store Reader

The Copilot CLI stores session data in SQLite at `~/.copilot/session-state/`. Opened in **read-only mode** using `better-sqlite3`.

### Queries

- `/sessions` → `SELECT id, branch, summary, created_at FROM sessions ORDER BY updated_at DESC LIMIT 10`
- `/search <query>` → FTS5 query on `search_index` with query expansion (OR-based synonym matching)
- `/session <id>` → joins `sessions` + `turns` + `checkpoints` for a rich session summary

### Telegram Formatting

Sessions are formatted as:

```
📂 Session: abc-123
🌿 Branch: main
📝 Summary: Implemented auth module
⏰ Updated: 2 minutes ago
```

## Notification Watcher

A polling loop running every 30 seconds:

1. Query `sessions` table for `updated_at > last_check_timestamp`
2. For new/updated sessions, query `checkpoints` for the latest checkpoint
3. Send formatted notification to Telegram:

```
🔔 Session Update
📂 repo: owner/repo (branch: main)
📝 Checkpoint: "Implemented auth module"
⏰ 2 minutes ago
```

### Design Decisions

- **Polling over file watching** — more reliable for SQLite (avoids WAL journal conflicts). 30-second interval balances responsiveness with DB load.
- **Deduplication** — tracks `(session_id, checkpoint_number)` pairs in memory to avoid re-notifying on the same checkpoint.
- **Toggle** — `/notify on|off` lets the user silence notifications when they don't want them.

## Authentication

Simple Telegram user ID whitelist:

- `ALLOWED_USER_ID` env var contains the authorized Telegram user ID
- Auth middleware checks `ctx.from.id` against the whitelist on every incoming message
- Unauthorized requests are silently ignored (no error response to prevent enumeration)

## Project Structure

```
personal-assistant/
├── src/
│   ├── index.ts              # Entry point — starts bot + watcher
│   ├── bot/
│   │   ├── bot.ts            # Grammy bot setup, middleware, command registration
│   │   ├── commands/
│   │   │   ├── copilot.ts    # /copilot command handler
│   │   │   ├── shell.ts      # /shell command handler
│   │   │   ├── sessions.ts   # /sessions, /search, /session handlers
│   │   │   ├── status.ts     # /status command handler
│   │   │   └── settings.ts   # /cwd, /notify, /kill handlers
│   │   └── middleware/
│   │       ├── auth.ts       # Telegram user ID whitelist check
│   │       └── logger.ts     # Request logging
│   ├── pty/
│   │   ├── manager.ts        # PTY lifecycle management
│   │   ├── output-buffer.ts  # Debounced output buffering
│   │   └── ansi-strip.ts     # ANSI escape code removal
│   ├── sessions/
│   │   ├── store-reader.ts   # SQLite session store queries
│   │   └── watcher.ts        # Notification polling loop
│   └── utils/
│       ├── config.ts         # Env var loading & validation (zod)
│       ├── telegram.ts       # Message chunking & formatting helpers
│       └── logger.ts         # Structured logging (pino)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Configuration

```env
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
ALLOWED_USER_ID=123456789
DEFAULT_CWD=/Users/bs01080/Desktop/aihero
SESSION_STORE_PATH=~/.copilot/session-state
PTY_IDLE_TIMEOUT_MS=1800000
NOTIFICATION_POLL_INTERVAL_MS=30000
```

All config validated at startup with `zod`. Missing required vars cause immediate exit with a clear error message.

## Dependencies

| Package | Purpose |
|---------|---------|
| `grammy` | Telegram bot framework (TypeScript-first, modern) |
| `node-pty` | Pseudo-terminal bindings for spawning terminal sessions |
| `better-sqlite3` | Synchronous SQLite driver for session store queries |
| `strip-ansi` | ANSI escape code removal from terminal output |
| `pino` | Structured JSON logging |
| `dotenv` | Environment variable loading |
| `zod` | Configuration schema validation |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | TypeScript compiler |
| `vitest` | Test framework |
| `tsx` | TypeScript execution for development |
| `@types/better-sqlite3` | Type definitions |

## Testing Strategy

- **Unit tests:** Output buffering logic, ANSI stripping, message chunking, config validation
- **Integration tests:** Session store queries against a test SQLite DB with fixture data
- **Manual testing:** PTY bridge interactions (terminal behavior is difficult to unit test reliably)
- **Framework:** `vitest`

## Out of Scope

- Multi-user support
- Multi-machine / remote machine access
- Web UI dashboard
- File upload/download via Telegram
- Voice message support
- Inline keyboard navigation for session browsing (can be added later)
