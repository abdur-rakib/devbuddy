# Telegram GitHub Bot — Design Spec

**Date:** 2026-05-07
**Status:** Approved
**Approach:** Monolithic Bot (Approach A)
**Replaces:** 2026-05-02-telegram-copilot-bridge-design.md

## Problem Statement

Build a personal Telegram bot that serves as a single interface for managing GitHub repositories, reviewing PRs with AI assistance, deploying via CI/CD, fixing issues conversationally, and running terminal commands — all from a phone.

Single user, single machine, running locally.

## Architecture

```
┌─────────────┐     HTTPS/Polling      ┌──────────────────────────────────┐
│  Telegram    │◄──────────────────────►│  Bot Server (Grammy + TypeScript)│
│  (phone)     │                        └────────┬─────────────────────────┘
└─────────────┘                                  │
                        ┌────────────┬───────────┼───────────┬──────────────┐
                        │            │           │           │              │
                  ┌─────▼─────┐ ┌────▼────┐ ┌───▼────┐ ┌───▼─────┐ ┌─────▼──────┐
                  │ PTY Module│ │ GitHub  │ │ CI/CD  │ │ Issue   │ │ Session    │
                  │ (node-pty)│ │ Module  │ │ Module │ │ Fixer   │ │ Store      │
                  │           │ │(octokit)│ │(octokit│ │(copilot │ │ Reader     │
                  │ copilot,  │ │         │ │+actions│ │ + git)  │ │(sqlite)    │
                  │ shell     │ │ repos,  │ │        │ │         │ │            │
                  └───────────┘ │ PRs     │ └────────┘ └─────────┘ └────────────┘
                                └─────────┘
```

Five core modules behind the Grammy bot:

1. **PTY Module** — spawns and manages pseudo-terminal sessions for Copilot CLI and raw shell commands. Buffers output, strips ANSI codes, chunks for Telegram's 4096-char limit.
2. **GitHub Module** — repo browsing, PR reading, and AI-assisted PR review via Octokit REST API.
3. **CI/CD Module** — trigger GitHub Actions workflows, monitor runs, view job logs, re-run failed jobs.
4. **Issue Fixer** — conversational issue fixing using Copilot CLI + git + GitHub API. Clones repo, creates branch, starts Copilot session, iterates with user, creates PR.
5. **Session Store Reader** — reads Copilot CLI session store (SQLite) for history browsing and FTS5 search.

## Bot Commands

### Core

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + auth check |
| `/status` | Bot health, active sessions, current repo |
| `/help` | List all commands |

### Terminal (PTY)

| Command | Description |
|---------|-------------|
| `/copilot <prompt>` | Send prompt to Copilot CLI PTY session |
| `/shell <cmd>` | Run a shell command |
| `/kill` | Terminate active PTY session |

### GitHub / Repos

| Command | Description |
|---------|-------------|
| `/repos` | List your GitHub repos (paginated, inline keyboard) |
| `/repo <owner/name>` | Switch active repo context |
| `/branches` | List branches of active repo |

### Pull Requests

| Command | Description |
|---------|-------------|
| `/prs` | List open PRs in active repo |
| `/pr <number>` | View PR details — title, description, files changed, CI status |
| `/diff <pr_number>` | View PR diff (chunked for Telegram) |
| `/review <pr_number>` | AI-assisted review — Copilot analyzes PR, shows summary + suggested comments, user approves/edits before posting |
| `/approve <pr_number>` | Approve a PR |
| `/merge <pr_number>` | Merge a PR (inline keyboard for merge strategy: merge/squash/rebase) |

### CI/CD

| Command | Description |
|---------|-------------|
| `/workflows` | List workflows in active repo |
| `/deploy <workflow> [branch]` | Trigger a workflow_dispatch event |
| `/runs [workflow]` | List recent workflow runs |
| `/run <run_id>` | View run details — jobs, steps, status |
| `/logs <job_id>` | View job logs (last 100 lines, option for full output as file) |
| `/rerun <run_id>` | Re-run failed jobs in a workflow run |

### Issues

| Command | Description |
|---------|-------------|
| `/issues` | List open issues in active repo |
| `/issue <number>` | View issue details (title, body, labels, assignees) |
| `/fix <issue_number>` | Start conversational fix session (see Issue Fixer section) |

### Settings

| Command | Description |
|---------|-------------|
| `/cwd <path>` | Change working directory for new sessions |
| `/notify on\|off` | Toggle real-time session notifications |

**Non-command messages:** Plain text without a `/` prefix is routed to:
1. The active `/fix` conversation session (if one exists), or
2. The active Copilot PTY session (if one exists), or
3. An error message suggesting the user start a session first.

## PTY Module

### Session Lifecycle

- **One active PTY per type** — one for Copilot CLI, one for shell. Prevents confusion.
- **Auto-timeout** — PTY sessions idle for 30 minutes are killed with a notification.
- **Output buffering** — 500ms debounce window to batch streaming output and avoid Telegram rate limits.
- **Working directory** — persisted across sessions via `/cwd`. Defaults to `$DEFAULT_CWD`.
- **Shell commands** — each `/shell` invocation spawns a fresh PTY (execute, capture, close).

### Output Handling

- Short outputs (<4096 chars) → single Telegram message with monospace formatting
- Long outputs → split into chunks, sent as multiple messages
- Very long outputs (>20K chars) → truncated with "showing last N lines" + option to get full output as a file attachment

### Error Handling

- PTY spawn failure → Telegram message with error details
- PTY crash/exit → notification with exit code
- Telegram API rate limit → exponential backoff message queue

## GitHub Module

Wraps Octokit REST API with a personal access token.

### Repo Context

A middleware layer (`repo-context.ts`) maintains the "active repo" state:
- Set via `/repo owner/name`
- Persisted in memory (single-user, resets on restart)
- All repo-scoped commands (`/prs`, `/issues`, `/workflows`, etc.) use the active repo
- Commands fail gracefully with "No active repo. Use /repo owner/name first." if not set

### Repo Operations

- `/repos` — lists repos using `GET /user/repos` with pagination via inline keyboard buttons (prev/next)
- `/repo owner/name` — validates the repo exists and sets it as active context
- `/branches` — lists branches of active repo

### Pull Request Operations

- `/prs` — lists open PRs with title, author, created date
- `/pr <number>` — fetches PR details: title, body, files changed count, CI status (combined commit status + check runs), review status
- `/diff <number>` — fetches PR diff, chunks it for Telegram
- `/approve <number>` — posts an APPROVE review
- `/merge <number>` — shows inline keyboard with merge strategies (merge commit, squash, rebase), then merges

## AI-Assisted PR Review

When `/review <pr_number>` is invoked:

1. **Fetch PR data** — diff, files changed, description, existing review comments via Octokit
2. **Send to Copilot CLI** — spawn a Copilot session with prompt: "Review this pull request. Summarize changes, identify bugs, security issues, and logic errors. Focus on what genuinely matters — no style or formatting comments."
3. **Show AI summary in Telegram** — formatted review with inline keyboard buttons:
   - ✅ **Approve** — posts the review as `APPROVE` with AI summary as body
   - ✏️ **Edit** — user types modifications, bot merges with AI feedback
   - 💬 **Comment only** — posts as `COMMENT` (no approval/rejection)
   - ❌ **Discard** — throw away the review
4. **Post to GitHub** — via `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`

The user always has final say. The AI drafts, the user decides.

## CI/CD Module

### Workflow Operations

- `/workflows` — lists workflows via `GET /repos/{owner}/{repo}/actions/workflows`
- `/deploy <workflow> [branch]` — triggers `workflow_dispatch` event. If branch is omitted, uses the repo's default branch.
- `/runs [workflow]` — lists recent workflow runs, optionally filtered by workflow name. Shows status emoji (✅ ❌ 🔄 ⏳).
- `/run <run_id>` — fetches run details including all jobs and their steps with status indicators
- `/logs <job_id>` — fetches job logs (last 100 lines by default). Offers inline keyboard to get full logs as a file attachment.
- `/rerun <run_id>` — re-runs only the failed jobs in a workflow run

### Real-Time Monitoring

After triggering a deploy or monitoring a run, the bot can poll the run status every 15 seconds and send updates when status changes (e.g., "Job 'build' completed ✅", "Job 'deploy' started 🔄").

Polling stops when:
- All jobs complete
- 30 minutes elapse (timeout)
- User sends `/kill` or starts a new command

## Issue Fixer — Conversational Flow

The most complex module. `/fix <issue_number>` starts a multi-turn conversation:

```
User sends /fix 42
       │
       ▼
  Fetch issue #42 from GitHub API (title, body, labels, comments)
       │
       ▼
  Clone/pull active repo to WORKSPACE_DIR/<owner>/<repo>
       │
       ▼
  git checkout -b fix/issue-42-<slug>
       │
       ▼
  Start Copilot CLI session with prompt:
    "Fix GitHub issue #42: <title>\n<body>\nRepo: <owner>/<repo>"
       │
       ▼
  ┌─────────────────────────────────┐
  │ CONVERSATION LOOP               │
  │                                 │
  │ Copilot output → Telegram user  │
  │ User text → Copilot input       │
  │                                 │
  │ Special commands during session: │
  │  • /diff — see current changes  │
  │  • /submit — create PR          │
  │  • /abort — discard and cleanup │
  └─────────────────────────────────┘
       │ (/submit)
       ▼
  git add . && git commit && git push
       │
       ▼
  Create PR via GitHub API:
    title: "Fix #42: <issue title>"
    body: auto-generated summary of conversation + changes
    base: default branch (main/master)
       │
       ▼
  Send PR link to Telegram
  Cleanup: kill PTY session
```

### Key Behaviors

- **One fix session at a time** — prevents git conflicts and confusion
- **Local workspace** — fixes happen in `WORKSPACE_DIR`, separate from user's working directories
- **Branch naming** — `fix/issue-<number>-<slug>` where slug is derived from issue title
- **PR body** — auto-generated summary including: issue reference, changes made, conversation highlights
- **Abort cleanup** — `/abort` kills the PTY, deletes the local branch, does NOT push anything
- **State tracking** — fix session state (active issue, branch name, workspace path) stored in memory

## Session Store Reader

Reads the Copilot CLI session store SQLite DB at `~/.copilot/session-state/` in read-only mode.

- `/sessions` — lists last 10 sessions with branch, summary, timestamp
- `/search <query>` — FTS5 query on `search_index` with OR-based synonym expansion
- `/session <id>` — detailed view with turns and checkpoints

## Notification Watcher

Polls the session store DB every 30 seconds for new activity:

1. Query `sessions` for `updated_at > last_check_timestamp`
2. Fetch latest checkpoint for updated sessions
3. Send formatted notification to Telegram
4. Track `(session_id, checkpoint_number)` pairs to avoid duplicates
5. Toggle via `/notify on|off`

## Authentication

Simple Telegram user ID whitelist:

- `ALLOWED_USER_ID` env var contains the authorized Telegram user ID
- Auth middleware checks `ctx.from.id` on every incoming message
- Unauthorized requests are silently ignored (no response to prevent enumeration)

## Project Structure

```
personal-assistant/
├── src/
│   ├── index.ts                  # Entry point — starts bot + watcher
│   ├── bot/
│   │   ├── bot.ts                # Grammy bot setup, middleware, command registration
│   │   ├── commands/
│   │   │   ├── copilot.ts        # /copilot handler
│   │   │   ├── shell.ts          # /shell handler
│   │   │   ├── github.ts         # /repos, /repo, /branches
│   │   │   ├── pull-requests.ts  # /prs, /pr, /diff, /review, /approve, /merge
│   │   │   ├── ci-cd.ts          # /workflows, /deploy, /runs, /run, /logs, /rerun
│   │   │   ├── issues.ts         # /issues, /issue, /fix
│   │   │   └── settings.ts       # /cwd, /notify, /status, /help, /kill
│   │   ├── conversations/
│   │   │   ├── fix-session.ts    # Issue fix conversation state machine
│   │   │   └── review-session.ts # PR review interaction state
│   │   └── middleware/
│   │       ├── auth.ts           # Telegram user ID whitelist
│   │       ├── repo-context.ts   # Injects active repo into handler context
│   │       └── logger.ts         # Request logging
│   ├── github/
│   │   ├── client.ts             # Octokit singleton with auth
│   │   ├── repos.ts              # Repo listing, branch listing
│   │   ├── pull-requests.ts      # PR CRUD, diff fetching, review posting
│   │   ├── issues.ts             # Issue reading
│   │   ├── actions.ts            # Workflow triggers, run monitoring, log fetching
│   │   └── types.ts              # Shared GitHub types
│   ├── pty/
│   │   ├── manager.ts            # PTY lifecycle management
│   │   ├── output-buffer.ts      # Debounced output buffering (500ms)
│   │   └── ansi-strip.ts         # ANSI escape code removal
│   ├── sessions/
│   │   ├── store-reader.ts       # SQLite session store queries (read-only)
│   │   └── watcher.ts            # Notification polling loop (30s interval)
│   └── utils/
│       ├── config.ts             # Env var loading & validation (zod)
│       ├── telegram.ts           # Message chunking & formatting helpers
│       ├── git.ts                # Git operations (clone, branch, commit, push)
│       └── logger.ts             # Structured logging (pino)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Configuration

```env
# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
ALLOWED_USER_ID=123456789

# GitHub
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_DEFAULT_OWNER=your-github-username

# Paths
DEFAULT_CWD=/Users/bs01080/Desktop/aihero
SESSION_STORE_PATH=~/.copilot/session-state
WORKSPACE_DIR=/tmp/personal-assistant-workspace

# Timeouts
PTY_IDLE_TIMEOUT_MS=1800000
NOTIFICATION_POLL_INTERVAL_MS=30000
CI_POLL_INTERVAL_MS=15000
```

All config validated at startup with `zod`. Missing required vars cause immediate exit with a clear error message.

## Dependencies

| Package | Purpose |
|---------|---------|
| `grammy` | Telegram bot framework (TypeScript-first) |
| `node-pty` | Pseudo-terminal bindings |
| `octokit` | GitHub REST API client |
| `simple-git` | Programmatic git operations |
| `better-sqlite3` | SQLite driver for session store |
| `strip-ansi` | ANSI escape code removal |
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

- **Unit tests:** Output buffering, ANSI stripping, message chunking, config validation, git utility functions
- **Integration tests:** GitHub API wrappers against mock Octokit responses; session store queries against fixture SQLite DB
- **Manual testing:** PTY bridge interactions, Copilot CLI sessions, full `/fix` flow
- **Framework:** `vitest`

## Error Handling

| Scenario | Response |
|----------|----------|
| GitHub API rate limit | Telegram message with reset time, retry suggestion |
| GitHub API auth failure | "GitHub token invalid or expired. Check GITHUB_TOKEN." |
| Repo not found | "Repo not found. Check the name and your token permissions." |
| PTY spawn failure | Telegram message with error details |
| Workflow dispatch not supported | "This workflow doesn't support workflow_dispatch triggers." |
| Clone failure | "Failed to clone repo. Check disk space and permissions." |
| Merge conflict during fix | Notify user, suggest manual resolution |

## Out of Scope

- Multi-user support
- Multi-machine / remote machine access
- Web UI dashboard
- WhatsApp integration
- File upload/download via Telegram (except log files)
- Voice message support
- Webhook-based GitHub events (polling-only for now)
- Inline keyboard navigation for session browsing (can be added later)
