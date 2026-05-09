<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram" alt="Telegram Bot">
  <img src="https://img.shields.io/badge/GitHub-API-181717?logo=github" alt="GitHub API">
  <img src="https://img.shields.io/badge/license-ISC-green" alt="License">
</p>

# 🤖 DevBuddy

**Your AI-powered developer assistant — right inside Telegram.**

DevBuddy is a Telegram bot that brings GitHub directly into your chat. Browse repos, review pull requests with AI-generated feedback, generate code from natural language descriptions, and have free-form conversations about your codebase — all without leaving Telegram.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **Secure Auth** | Encrypted GitHub token storage with per-user onboarding |
| 📂 **Repo Browser** | List, select, and navigate your GitHub repositories |
| 🔀 **PR Management** | View PRs, inspect diffs, approve, and merge (squash/rebase/merge) |
| 🐛 **Issue Tracker** | Browse and manage repository issues |
| 🌿 **Branch Explorer** | List and inspect branches |
| 🤖 **AI PR Review** | Get AI-powered code review feedback on any pull request |
| ⚡ **Code Generation** | Describe what you want in plain English → get a PR with the changes |
| 💬 **AI Chat** | Free-form developer chat powered by GitHub Copilot models |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        TELEGRAM USER                                 │
│                     (Mobile / Desktop)                               │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             │  Messages / Callbacks
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      TELEGRAM BOT API                                │
│                  (api.telegram.org)                                   │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             │  grammY Framework
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                    ┌──────────────────────┐                           │
│                    │     bot.ts           │                           │
│                    │  Session + Auth MW   │                           │
│                    │  Callback Router     │                           │
│                    └─────────┬────────────┘                           │
│                              │                                       │
│          ┌───────────┬───────┼───────┬───────────┐                   │
│          ▼           ▼       ▼       ▼           ▼                   │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│   │  auth    │ │  github  │ │  review  │ │  codegen │ │   chat   │  │
│   │          │ │          │ │          │ │          │ │          │  │
│   │ • crypto │ │ • repos  │ │ • AI     │ │ • git    │ │ • free   │  │
│   │ • token  │ │ • issues │ │   review │ │ • worker │ │   form   │  │
│   │ • onboard│ │ • PRs    │ │ • prompts│ │ • prompts│ │ • prompts│  │
│   │          │ │ • branch │ │          │ │ • diff   │ │          │  │
│   └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│        │            │            │            │            │         │
│   D E V B U D D Y   │            │            │            │         │
│        │            │            │            │            │         │
│   ┌────▼────────────▼────────────▼────────────▼────────────▼─────┐   │
│   │                     Shared Services                          │   │
│   │  ┌─────────┐  ┌─────────────┐  ┌──────────┐  ┌───────────┐  │   │
│   │  │  UI     │  │  DB Layer   │  │ Copilot  │  │  Telegram │  │   │
│   │  │ menus   │  │  SQLite     │  │  API     │  │  helpers  │  │   │
│   │  │ kbd     │  │  schema     │  │  client  │  │  markdown │  │   │
│   │  │ pages   │  │  client     │  │          │  │           │  │   │
│   │  └─────────┘  └──────┬──────┘  └────┬─────┘  └───────────┘  │   │
│   └──────────────────────┼──────────────┼────────────────────────┘   │
│                          │              │                            │
└──────────────────────────┼──────────────┼────────────────────────────┘
                           │              │
               ┌───────────▼──┐    ┌──────▼───────────┐
               │   SQLite DB  │    │  GitHub Copilot  │
               │   (bot.db)   │    │  Models API      │
               │              │    │  (gpt-4o)        │
               └──────────────┘    └──────────────────┘
```

### Data Flow: PR Review Example

```
User taps "Review PR #42"
        │
        ▼
  ┌─────────────┐    fetch diff    ┌──────────────┐
  │   bot.ts    │ ──────────────▶  │  GitHub API  │
  │  (router)   │ ◀──────────────  │  (Octokit)   │
  └──────┬──────┘    PR diff       └──────────────┘
         │
         │  diff + review prompt
         ▼
  ┌──────────────┐   POST /chat    ┌──────────────┐
  │   review/    │ ──────────────▶ │  Copilot AI  │
  │  handlers   │ ◀──────────────  │  (gpt-4o)    │
  └──────┬──────┘   AI feedback    └──────────────┘
         │
         │  formatted review
         ▼
  ┌──────────────┐
  │  Telegram    │
  │  Message     │
  └──────────────┘
```

### Data Flow: Code Generation

```
User: "Add dark mode toggle to settings page"
        │
        ▼
  ┌─────────────┐   clone repo    ┌──────────────┐
  │  codegen/   │ ──────────────▶ │  GitHub API  │
  │  worker     │ ◀──────────────  │              │
  └──────┬──────┘                  └──────────────┘
         │
         │  repo + description
         ▼
  ┌──────────────┐   generate      ┌──────────────┐
  │  codegen/   │ ──────────────▶  │  Copilot AI  │
  │  prompts    │ ◀──────────────  │  (gpt-4o)    │
  └──────┬──────┘   code changes   └──────────────┘
         │
         │  git commit + push
         ▼
  ┌──────────────┐   create PR     ┌──────────────┐
  │  codegen/   │ ──────────────▶  │  GitHub API  │
  │  git        │ ◀──────────────  │              │
  └──────┬──────┘   PR link        └──────────────┘
         │
         ▼
  User gets PR link in Telegram
```

---

## 📁 Project Structure

```
devbuddy/
├── src/
│   ├── index.ts                 # Entry point — bootstrap and startup
│   ├── bot.ts                   # Bot creation, middleware, callback router
│   ├── config.ts                # Environment variable loader
│   ├── db/
│   │   ├── client.ts            # SQLite database connection
│   │   └── schema.ts            # Table definitions and migrations
│   ├── modules/
│   │   ├── auth/                # 🔐 Authentication & onboarding
│   │   │   ├── crypto.ts        #    Token encryption/decryption
│   │   │   ├── handlers.ts      #    /start, token input, settings
│   │   │   ├── middleware.ts    #    Auth guard middleware
│   │   │   └── types.ts         #    Session & context types
│   │   ├── github/              # 📂 GitHub repository operations
│   │   │   ├── client.ts        #    Octokit wrapper per user
│   │   │   ├── formatters.ts    #    Markdown formatters for Telegram
│   │   │   ├── handlers.ts      #    Repo, PR, issue, branch handlers
│   │   │   └── types.ts         #    GitHub-specific types
│   │   ├── review/              # 🤖 AI-powered PR review
│   │   │   ├── handlers.ts      #    Review orchestration
│   │   │   ├── prompts.ts       #    System prompts for AI review
│   │   │   └── types.ts         #    Review types
│   │   ├── codegen/             # ⚡ AI code generation
│   │   │   ├── git.ts           #    Git operations (clone, commit, push)
│   │   │   ├── handlers.ts      #    Codegen flow handlers
│   │   │   ├── prompts.ts       #    System prompts for codegen
│   │   │   ├── types.ts         #    Codegen job types
│   │   │   └── worker.ts        #    Background code generation worker
│   │   └── chat/                # 💬 AI chat
│   │       ├── handlers.ts      #    Chat message handling
│   │       ├── prompts.ts       #    System prompts for chat
│   │       └── types.ts         #    Chat types
│   ├── ui/                      # 🎨 Telegram UI components
│   │   ├── keyboards.ts         #    Inline keyboard builders
│   │   ├── menus.ts             #    Main menu and help screens
│   │   └── pagination.ts        #    Paginated list helpers
│   └── utils/                   # 🔧 Shared utilities
│       ├── copilot-api.ts       #    GitHub Copilot API client
│       └── telegram.ts          #    Telegram message helpers
├── tests/                       # 🧪 Test suites (mirrors src/ structure)
│   ├── db/
│   ├── modules/
│   ├── ui/
│   └── utils/
├── Dockerfile                   # Production container image
├── docker-compose.yml           # Docker Compose orchestration
├── Makefile                     # Build, test, and run automation
├── package.json                 # Dependencies and npm scripts
├── tsconfig.json                # TypeScript compiler configuration
├── vitest.config.ts             # Test runner configuration
└── .env.example                 # Environment variable template
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | ≥ 20 | Runtime |
| **npm** | ≥ 9 | Package manager |
| **Git** | any | Used by codegen module |
| **Docker** *(optional)* | any | Containerized deployment |
| **Make** *(optional)* | any | Task runner |

### 1. Clone the Repository

```bash
git clone https://github.com/abdur-rakib/devbuddy.git
cd devbuddy
```

### 2. Quick Setup

```bash
make setup
```

This runs `npm ci`, creates `.env` from the template, and prepares the `data/` directory.

### 3. Configure Environment

Edit `.env` with your credentials:

```bash
# Required — get from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Required — generate with: openssl rand -hex 32
ENCRYPTION_KEY=your-64-char-hex-key
```

<details>
<summary>📋 Full Environment Variable Reference</summary>

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Bot token from [@BotFather](https://t.me/BotFather) |
| `ENCRYPTION_KEY` | ✅ | — | 32-byte hex key for token encryption |
| `DB_PATH` | ❌ | `./data/bot.db` | SQLite database file path |
| `CODEGEN_DIR` | ❌ | `/tmp/codegen` | Temp directory for code generation |
| `COPILOT_API_URL` | ❌ | `https://models.github.ai/inference` | AI model endpoint |
| `COPILOT_MODEL` | ❌ | `gpt-4o` | AI model to use |

</details>

### 4. Run the Bot

#### Using Make (Recommended)

```bash
# Development with hot-reload
make dev

# Production build + start
make start

# Run tests
make test

# Type-check
make lint
```

#### Using npm Directly

```bash
npm run dev        # Development with hot-reload
npm run build      # Compile TypeScript
npm start          # Run compiled JS
npm test           # Run tests
```

#### Using Docker

```bash
# Build and start
make docker-up

# Or manually
docker compose up -d

# View logs
make docker-logs

# Stop
make docker-down
```

### All Makefile Targets

```
  Setup & Dependencies
    make install        Install dependencies (npm ci)
    make setup          First-time setup (install + .env + data dir)

  Development
    make dev            Start dev server with hot-reload
    make build          Compile TypeScript → JavaScript
    make start          Build and run the production bot

  Testing & Linting
    make test           Run all tests
    make test-watch     Run tests in watch mode
    make lint           Type-check the project

  Docker
    make docker-build   Build the Docker image
    make docker-up      Start containers (detached)
    make docker-down    Stop containers
    make docker-logs    Tail container logs

  Cleanup
    make clean          Remove dist/, node_modules/, and DB files
```

---

## 🔐 How Authentication Works

```
┌──────────┐         ┌──────────────┐        ┌──────────────┐
│  User    │         │   DevBuddy   │        │   SQLite DB  │
│(Telegram)│         │    Bot       │        │   (bot.db)   │
└────┬─────┘         └──────┬───────┘        └──────┬───────┘
     │                      │                       │
     │  /start              │                       │
     │─────────────────────▶│                       │
     │                      │  check user exists    │
     │                      │──────────────────────▶│
     │                      │◀──────────────────────│
     │  "Enter your GitHub  │                       │
     │   Personal Access    │                       │
     │   Token"             │                       │
     │◀─────────────────────│                       │
     │                      │                       │
     │  ghp_xxxxxxxxxxxx    │                       │
     │─────────────────────▶│                       │
     │                      │  encrypt(token)       │
     │                      │──────┐                │
     │                      │◀─────┘ AES-256-GCM    │
     │                      │                       │
     │                      │  store encrypted      │
     │                      │──────────────────────▶│
     │                      │                       │
     │  ✅ "You're all set!"│                       │
     │◀─────────────────────│                       │
     │                      │                       │
```

- Tokens are encrypted with **AES-256-GCM** before storage
- Each user's token is individually encrypted
- The encryption key is set via the `ENCRYPTION_KEY` env variable
- Tokens are decrypted in-memory only when making GitHub API calls

---

## 🧪 Testing

Tests are organized to mirror the `src/` directory structure:

```bash
# Run all tests
make test

# Watch mode (re-runs on file changes)
make test-watch
```

The project uses [Vitest](https://vitest.dev/) as the test runner with Node.js environment.

---

## 🐳 Docker Deployment

The Docker setup provides a production-ready deployment:

```
┌─────────────────────────────────────────────┐
│              docker-compose                  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │           bot container                │  │
│  │                                        │  │
│  │   node:20-alpine + git                 │  │
│  │   npm ci → tsc → node dist/index.js    │  │
│  │                                        │  │
│  │   Volumes:                             │  │
│  │     ./data → /app/data  (SQLite DB)    │  │
│  │     codegen-tmp → /tmp/codegen         │  │
│  │                                        │  │
│  │   Restart: unless-stopped              │  │
│  └────────────────────────────────────────┘  │
│                                              │
└─────────────────────────────────────────────┘
```

The `data/` volume is mounted from the host so the SQLite database persists across container restarts.

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create a branch** for your feature: `git checkout -b feat/my-feature`
3. **Make your changes** and add tests
4. **Run checks** before committing:
   ```bash
   make lint
   make test
   ```
5. **Commit** with a descriptive message following [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat(module): add new capability
   fix(auth): handle expired tokens
   ```
6. **Push** and open a Pull Request

### Branch Naming

| Prefix | Purpose |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `refactor/` | Code improvements |
| `docs/` | Documentation |
| `test/` | Test additions/changes |

---

## 📄 License

This project is licensed under the **ISC License**. See the `package.json` for details.

---

<p align="center">
  Built with ❤️ using <a href="https://grammy.dev">grammY</a>, <a href="https://github.com/octokit/rest.js">Octokit</a>, and <a href="https://github.com/features/copilot">GitHub Copilot</a>
</p>
