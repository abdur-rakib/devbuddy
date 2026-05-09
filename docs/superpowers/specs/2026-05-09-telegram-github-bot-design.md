# Telegram GitHub Bot — Design Spec

**Date:** 2026-05-09
**Status:** Approved
**Approach:** Monolithic Bot (Grammy + TypeScript)

## Problem Statement

Build a multi-user Telegram bot that connects to GitHub. Each user provides their own GitHub PAT (used for both the GitHub REST API and the Copilot Models API). The bot enables browsing repos, issues, and PRs, AI-powered PR review, AI-driven code generation with human review before PR creation, and free-form AI chat — all through an inline-keyboard-driven Telegram UI.

## Architecture

```
┌─────────────┐     HTTPS/Polling      ┌──────────────────────────────────┐
│  Telegram    │◄──────────────────────►│  Bot Server (Grammy + TypeScript)│
│  (users)     │                        └────────┬─────────────────────────┘
└─────────────┘                                  │
                        ┌────────────┬───────────┼───────────┬──────────────┐
                        │            │           │           │              │
                  ┌─────▼─────┐ ┌────▼────┐ ┌───▼────┐ ┌───▼─────┐ ┌─────▼──────┐
                  │ Auth      │ │ GitHub  │ │ PR     │ │ CodeGen │ │ AI Chat    │
                  │ Module    │ │ Module  │ │ Review │ │ Module  │ │ Module     │
                  │           │ │         │ │ Module │ │         │ │            │
                  │ token mgmt│ │ repos,  │ │ AI     │ │ clone,  │ │ Copilot    │
                  │ user ctx  │ │ issues, │ │ review │ │ edit,   │ │ Models API │
                  │ encryption│ │ PRs     │ │ via    │ │ push,   │ │ convo      │
                  │           │ │ via API │ │ Copilot│ │ create  │ │ history    │
                  └───────────┘ └─────────┘ └────────┘ │ PR      │ └────────────┘
                                                       └─────────┘
                                    │
                              ┌─────▼─────┐
                              │  SQLite    │
                              │ users,     │
                              │ sessions,  │
                              │ chat hist  │
                              └────────────┘
```

### Modules

1. **Auth Module** — User registration, token storage (AES-256-GCM encrypted at rest), per-user GitHub API client factory (Octokit), per-user Copilot API client factory. A single GitHub PAT serves both purposes. Grammy middleware checks auth on every message.

2. **GitHub Module** — Wraps GitHub REST API via user's PAT using Octokit. Browse repos, list issues, list PRs, view PR diffs, branch listing. Each user gets their own Octokit instance scoped to their token.

3. **PR Review Module** — Fetches PR diff via GitHub API, sends to Copilot Models API for analysis. Returns structured review (summary, issues found, suggestions). User can approve, request changes, or post comments via inline keyboards.

4. **CodeGen Module** — Clones repo to isolated temp directory, creates branch, sends repo context + user instructions to Copilot Models API, applies generated code changes, commits, pushes, creates PR. Runs in child process (`child_process.fork()`) to avoid blocking. Workspace cleanup after completion.

5. **AI Chat Module** — Free-form conversation with Copilot Models API. Maintains per-user conversation history in SQLite. Can be repo-aware (user sets active project context).

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `grammy` | Telegram Bot framework |
| `octokit` | GitHub REST API client |
| `better-sqlite3` | SQLite database |
| `execa` | Safe subprocess execution (git, child processes) |
| `node:crypto` | AES-256-GCM token encryption |

## User Flow & UI

### Onboarding

```
User sends /start
  → Bot asks for GitHub PAT (with required scopes: repo, read:org)
  → Bot validates token (test API call to /user)
  → ✅ "You're set up! Use the menu below to get started."
  → Shows main menu inline keyboard
```

### Main Menu

```
┌──────────────┬──────────────┐
│ 📂 Repos     │ 💬 AI Chat   │
├──────────────┼──────────────┤
│ ⚙️ Settings  │ ❓ Help      │
└──────────────┴──────────────┘
```

### Repo Context Menu

After selecting a repo:

```
┌──────────────┬──────────────┐
│ 🔀 PRs       │ 🐛 Issues    │
├──────────────┼──────────────┤
│ 🌿 Branches  │ 🤖 New Feature│
├──────────────┴──────────────┤
│ ◀️ Back to Repos             │
└─────────────────────────────┘
```

### PR Detail View

```
PR #42: Fix login timeout
By @john | main ← fix/login
Status: Open | CI: ✅ passed

┌──────────┬──────────┬──────────┐
│ 📄 Diff  │ 🤖 Review│ 💬 Comments│
├──────────┼──────────┼──────────┤
│ ✅ Approve│ 🔀 Merge │ ◀️ Back   │
└──────────┴──────────┴──────────┘
```

### AI Code Generation Flow

```
User taps "🤖 New Feature"
  → Bot: "Describe what you want to build:"
  → User types description
  → Bot: "Working on it... 🔄" (clone, generate, commit)
  → Bot shows summary of changes (files modified, diff preview)
  → Inline keyboard: [✅ Create PR] [📄 View Full Diff] [🔄 Revise] [❌ Cancel]
  → If "Revise": user provides feedback, AI iterates
  → If "Create PR": bot pushes and creates PR
```

### AI Chat Flow

```
User taps "💬 AI Chat"
  → Free-form conversation mode
  → Can reference current project context
  → Bot maintains conversation history
  → [🔄 New Chat] [◀️ Back] buttons always visible
```

## Data Model

```sql
-- Users and their tokens
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  telegram_id INTEGER UNIQUE NOT NULL,
  telegram_username TEXT,
  github_token_enc BLOB NOT NULL,    -- AES-256 encrypted PAT (used for both GitHub API and Copilot)
  active_repo_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cached repo list per user
CREATE TABLE repos (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  github_repo_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,           -- e.g., "owner/repo"
  default_branch TEXT,
  last_synced DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- AI chat history
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Code generation jobs
CREATE TABLE codegen_jobs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  repo_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  branch_name TEXT,
  pr_url TEXT,
  workspace_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Token encryption: AES-256-GCM with a master key from `ENCRYPTION_KEY` environment variable. Tokens are never stored in plaintext. A single GitHub PAT is used for both the GitHub REST API and the Copilot Models API.

## Code Generation Detail

### Flow

1. User selects project and taps "🤖 New Feature"
2. User describes the feature in natural language
3. Bot creates a `codegen_jobs` record (status: `pending`)
4. Bot spawns `child_process.fork()` to:
   a. Clone repo to `/tmp/codegen/<job-id>/` (shallow clone, depth=1)
   b. Create branch: `feature/<sanitized-description>-<short-id>`
   c. Read key files (package.json, README, src/ structure) for context
   d. Send to Copilot Models API:
      - System prompt with repo structure and conventions
      - User's feature description
      - Request: list of file changes (create/modify/delete)
   e. Parse AI response, apply file changes
   f. `git add` + `git commit` with descriptive message
   g. Update job status to `review`
5. Bot notifies user with change summary
6. User reviews via inline keyboard:
   - View diff (chunked for Telegram's 4096-char limit)
   - Revise (send feedback → AI iterates, re-applies)
   - Create PR (`git push` + GitHub API create PR)
   - Cancel (cleanup workspace)
7. After PR created or cancelled → cleanup temp directory

### Safety Measures

- Each job gets an isolated temp directory
- 10-minute timeout per job
- Max 1 concurrent codegen job per user
- Workspace cleanup on completion, failure, and timeout
- Branch naming prevents conflicts via short UUID suffix

### Copilot Models API

- Endpoint: `https://models.github.ai/inference`
- Models: `gpt-4o` or `claude-sonnet-4-20250514` (user's GitHub token)
- Structured JSON output for file changes
- Multi-turn support for revision iterations

## Error Handling

- All GitHub API calls wrapped in try/catch with user-friendly error messages
- Token validation on setup and periodic re-validation
- Invalid/expired token → prompt user to update via Settings menu
- Copilot API rate limits → queue with exponential backoff
- CodeGen failures → notify user, cleanup workspace, log error
- Unhandled errors → generic "Something went wrong" message + internal logging

## Security

- Tokens encrypted at rest with AES-256-GCM
- Master encryption key via `ENCRYPTION_KEY` environment variable
- No tokens in logs (scrubbed from all output)
- Each user can only access their own data (Telegram user ID is identity anchor)
- Temp workspaces owned by bot process, deleted on completion
- No shell injection: all git operations use `execa` with argument arrays (no string interpolation into shell commands)
- Grammy webhook secret for production deployments

## Rate Limiting

| Resource | Limit |
|----------|-------|
| GitHub API calls | 5/second per user |
| Concurrent codegen jobs | 1 per user |
| AI chat messages | 30/hour per user |

## Deployment

```yaml
# docker-compose.yml
services:
  bot:
    build: .
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - ./data:/app/data
      - /tmp/codegen:/tmp/codegen
    restart: unless-stopped
```

Environment variables (`.env`):
- `TELEGRAM_BOT_TOKEN` — from BotFather
- `ENCRYPTION_KEY` — 32-byte hex string for AES-256-GCM

## Project Structure

```
devbuddy/
├── src/
│   ├── index.ts
│   ├── bot.ts
│   ├── config.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── migrations/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── middleware.ts
│   │   │   ├── handlers.ts
│   │   │   ├── crypto.ts
│   │   │   └── types.ts
│   │   ├── github/
│   │   │   ├── client.ts
│   │   │   ├── handlers.ts
│   │   │   ├── formatters.ts
│   │   │   └── types.ts
│   │   ├── review/
│   │   │   ├── handlers.ts
│   │   │   ├── prompts.ts
│   │   │   └── types.ts
│   │   ├── codegen/
│   │   │   ├── handlers.ts
│   │   │   ├── worker.ts
│   │   │   ├── prompts.ts
│   │   │   ├── git.ts
│   │   │   └── types.ts
│   │   └── chat/
│   │       ├── handlers.ts
│   │       ├── prompts.ts
│   │       └── types.ts
│   ├── ui/
│   │   ├── keyboards.ts
│   │   ├── menus.ts
│   │   └── pagination.ts
│   └── utils/
│       ├── telegram.ts
│       └── copilot-api.ts
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```
