# Telegram GitHub Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-user Telegram bot that lets users manage GitHub repos, issues, PRs, get AI-powered PR reviews, generate code with AI, and chat with AI — all via inline keyboards.

**Architecture:** Monolithic Grammy bot (TypeScript) with 5 modules (Auth, GitHub, PR Review, CodeGen, AI Chat). Single GitHub PAT per user for both GitHub API (Octokit) and Copilot Models API. SQLite for persistence. Docker for deployment.

**Tech Stack:** TypeScript, Grammy, Octokit, better-sqlite3, execa, node:crypto (AES-256-GCM), Docker

---

## File Structure

```
devbuddy/
├── src/
│   ├── index.ts              — Entry point: init DB, create bot, start polling
│   ├── bot.ts                — Grammy bot instance, middleware registration, command/callback routing
│   ├── config.ts             — Environment variable loading and validation
│   ├── db/
│   │   ├── client.ts         — SQLite connection singleton (better-sqlite3)
│   │   └── schema.ts         — Table creation DDL, migration runner
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── types.ts      — User type, AuthContext extension for Grammy
│   │   │   ├── crypto.ts     — AES-256-GCM encrypt/decrypt for tokens
│   │   │   ├── middleware.ts — Grammy middleware: load user from DB, attach to ctx
│   │   │   └── handlers.ts  — /start onboarding flow, settings handlers
│   │   ├── github/
│   │   │   ├── types.ts      — Repo, Issue, PR, Branch types
│   │   │   ├── client.ts     — Per-user Octokit factory
│   │   │   ├── formatters.ts — Format GitHub API responses for Telegram messages
│   │   │   └── handlers.ts  — Repo list, issue list, PR list, branch list, PR detail handlers
│   │   ├── review/
│   │   │   ├── types.ts      — ReviewResult type
│   │   │   ├── prompts.ts    — System prompt for AI PR review
│   │   │   └── handlers.ts  — PR review flow: fetch diff → AI review → display → actions
│   │   ├── codegen/
│   │   │   ├── types.ts      — CodeGenJob, FileChange types
│   │   │   ├── prompts.ts    — System prompt for AI code generation
│   │   │   ├── git.ts        — Git operations: clone, branch, commit, push (via execa)
│   │   │   ├── worker.ts     — Child process worker: clone → AI → apply → commit
│   │   │   └── handlers.ts  — New feature flow: describe → generate → review → create PR
│   │   └── chat/
│   │       ├── types.ts      — ChatSession type
│   │       ├── prompts.ts    — System prompt for AI chat
│   │       └── handlers.ts  — Chat flow: free-form conversation, new chat, history
│   ├── ui/
│   │   ├── keyboards.ts      — Inline keyboard builder functions
│   │   ├── menus.ts          — Main menu, repo menu, PR menu keyboard definitions
│   │   └── pagination.ts    — Paginated list helper with prev/next buttons
│   └── utils/
│       ├── telegram.ts       — Message chunking (4096 char limit), markdown escaping
│       └── copilot-api.ts    — Copilot Models API client (chat completions)
├── tests/
│   ├── crypto.test.ts        — Token encryption round-trip tests
│   ├── formatters.test.ts    — GitHub data formatting tests
│   ├── telegram.test.ts      — Message chunking tests
│   ├── copilot-api.test.ts   — Copilot API client tests (mocked HTTP)
│   ├── pagination.test.ts    — Pagination helper tests
│   └── git.test.ts           — Git operations tests (integration)
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── .gitignore
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/config.ts`

- [ ] **Step 1: Initialize npm project**

Run:
```bash
cd /Users/bs01080/Desktop/aihero/devbuddy
npm init -y
```

- [ ] **Step 2: Install production dependencies**

Run:
```bash
npm install grammy @octokit/rest better-sqlite3 execa
```

- [ ] **Step 3: Install dev dependencies**

Run:
```bash
npm install -D typescript @types/node @types/better-sqlite3 vitest tsx
```

- [ ] **Step 4: Create tsconfig.json**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 5: Create vitest.config.ts**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 6: Add scripts to package.json**

Update `package.json` scripts:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Also set `"type": "module"` in package.json.

- [ ] **Step 7: Create .env.example**

Create `.env.example`:
```
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-from-botfather
ENCRYPTION_KEY=generate-with-openssl-rand-hex-32
```

- [ ] **Step 8: Create .gitignore**

Create `.gitignore`:
```
node_modules/
dist/
.env
data/
/tmp/codegen/
*.db
*.db-journal
```

- [ ] **Step 9: Create src/config.ts**

Create `src/config.ts`:
```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnv(): void {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  encryptionKey: required("ENCRYPTION_KEY"),
  dbPath: process.env["DB_PATH"] ?? join(process.cwd(), "data", "bot.db"),
  codegenDir: process.env["CODEGEN_DIR"] ?? "/tmp/codegen",
  copilotApiUrl:
    process.env["COPILOT_API_URL"] ?? "https://models.github.ai/inference",
  copilotModel: process.env["COPILOT_MODEL"] ?? "gpt-4o",
} as const;
```

- [ ] **Step 10: Create directory structure**

Run:
```bash
mkdir -p src/db src/modules/auth src/modules/github src/modules/review src/modules/codegen src/modules/chat src/ui src/utils tests
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold project with TypeScript, Grammy, Vitest

Set up package.json, tsconfig, vitest config, .env.example,
.gitignore, and src/config.ts with environment variable loading."
```

---

## Task 2: Database Layer

**Files:**
- Create: `src/db/client.ts`
- Create: `src/db/schema.ts`

- [ ] **Step 1: Create src/db/client.ts**

```typescript
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

- [ ] **Step 2: Create src/db/schema.ts**

```typescript
import { getDb } from "./client.js";

export function initializeSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      telegram_id INTEGER UNIQUE NOT NULL,
      telegram_username TEXT,
      github_token_enc BLOB NOT NULL,
      active_repo_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      github_repo_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      default_branch TEXT,
      last_synced DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS codegen_jobs (
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
  `);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/db/
git commit -m "feat: add SQLite database layer with schema

Create client.ts (connection singleton with WAL mode) and
schema.ts (users, repos, chat_messages, codegen_jobs tables)."
```

---

## Task 3: Auth Module — Crypto

**Files:**
- Create: `src/modules/auth/crypto.ts`
- Create: `tests/crypto.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/crypto.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../src/modules/auth/crypto.js";

describe("crypto", () => {
  const testKey = "a".repeat(64); // 32 bytes hex

  it("encrypts and decrypts a token round-trip", () => {
    const token = "ghp_abc123XYZ456testtoken";
    const encrypted = encrypt(token, testKey);
    expect(encrypted).not.toContain(token);
    const decrypted = decrypt(encrypted, testKey);
    expect(decrypted).toBe(token);
  });

  it("produces different ciphertexts for the same input", () => {
    const token = "ghp_sametoken";
    const enc1 = encrypt(token, testKey);
    const enc2 = encrypt(token, testKey);
    expect(enc1).not.toBe(enc2);
  });

  it("throws on tampered ciphertext", () => {
    const token = "ghp_tampertest";
    const encrypted = encrypt(token, testKey);
    const tampered = encrypted.slice(0, -2) + "ff";
    expect(() => decrypt(tampered, testKey)).toThrow();
  });

  it("throws on wrong key", () => {
    const token = "ghp_wrongkey";
    const encrypted = encrypt(token, "a".repeat(64));
    expect(() => decrypt(encrypted, "b".repeat(64))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crypto.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/modules/auth/crypto.ts`:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encrypt(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: iv (12) + tag (16) + ciphertext, all as hex
  return Buffer.concat([iv, tag, encrypted]).toString("hex");
}

export function decrypt(hex: string, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex");
  const data = Buffer.from(hex, "hex");

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/crypto.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/crypto.ts tests/crypto.test.ts
git commit -m "feat(auth): add AES-256-GCM token encryption

Encrypt/decrypt with random IV per operation, auth tag verification,
and hex encoding. Includes round-trip, uniqueness, and tamper tests."
```

---

## Task 4: Auth Module — Types, Middleware, Handlers

**Files:**
- Create: `src/modules/auth/types.ts`
- Create: `src/modules/auth/middleware.ts`
- Create: `src/modules/auth/handlers.ts`

- [ ] **Step 1: Create src/modules/auth/types.ts**

```typescript
import type { Context, SessionFlavor } from "grammy";

export interface UserRecord {
  id: number;
  telegram_id: number;
  telegram_username: string | null;
  github_token_enc: string;
  active_repo_id: number | null;
  created_at: string;
}

export interface SessionData {
  onboardingStep?: "awaiting_token";
  chatSessionId?: string;
  codegenJobId?: string;
  codegenAwaitingDescription?: boolean;
  codegenAwaitingRevision?: boolean;
}

export type BotContext = Context &
  SessionFlavor<SessionData> & {
    user?: UserRecord;
  };
```

- [ ] **Step 2: Create src/modules/auth/middleware.ts**

```typescript
import type { NextFunction } from "grammy";
import type { BotContext, UserRecord } from "./types.js";
import { getDb } from "../../db/client.js";

const PUBLIC_COMMANDS = ["/start", "/help"];

export async function authMiddleware(
  ctx: BotContext,
  next: NextFunction
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const db = getDb();
  const user = db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as UserRecord | undefined;

  if (user) {
    ctx.user = user;
    return next();
  }

  // Allow public commands for unauthenticated users
  const text = ctx.message?.text ?? "";
  if (PUBLIC_COMMANDS.some((cmd) => text.startsWith(cmd))) {
    return next();
  }

  // Also allow callback queries during onboarding
  if (ctx.callbackQuery) {
    return next();
  }

  // If user is in onboarding (session has onboardingStep), let through
  if (ctx.session?.onboardingStep) {
    return next();
  }

  await ctx.reply(
    "👋 Welcome! Please send /start to set up your GitHub account."
  );
}
```

- [ ] **Step 3: Create src/modules/auth/handlers.ts**

```typescript
import type { BotContext } from "./types.js";
import { encrypt } from "./crypto.js";
import { config } from "../../config.js";
import { getDb } from "../../db/client.js";
import { Octokit } from "@octokit/rest";
import { mainMenuKeyboard } from "../../ui/keyboards.js";

export async function handleStart(ctx: BotContext): Promise<void> {
  if (ctx.user) {
    await ctx.reply("👋 Welcome back! Here's your main menu:", {
      reply_markup: mainMenuKeyboard(),
    });
    return;
  }

  await ctx.reply(
    "👋 Welcome to GitHub Bot!\n\n" +
      "To get started, I need your GitHub Personal Access Token.\n\n" +
      "Required scopes: `repo`, `read:org`\n\n" +
      "Create one at: https://github.com/settings/tokens\n\n" +
      "Send me your token now (I'll encrypt and store it securely):",
    { parse_mode: "Markdown" }
  );
  ctx.session.onboardingStep = "awaiting_token";
}

export async function handleTokenInput(ctx: BotContext): Promise<void> {
  if (ctx.session.onboardingStep !== "awaiting_token") return;

  const token = ctx.message?.text?.trim();
  if (!token) {
    await ctx.reply("Please send a valid GitHub token.");
    return;
  }

  // Delete the message containing the token for security
  try {
    await ctx.deleteMessage();
  } catch {
    // May fail if bot doesn't have delete permission
  }

  // Validate the token
  const octokit = new Octokit({ auth: token });
  try {
    const { data: githubUser } = await octokit.rest.users.getAuthenticated();

    const encryptedToken = encrypt(token, config.encryptionKey);
    const db = getDb();

    db.prepare(
      `INSERT INTO users (telegram_id, telegram_username, github_token_enc)
       VALUES (?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         github_token_enc = excluded.github_token_enc,
         telegram_username = excluded.telegram_username`
    ).run(
      ctx.from!.id,
      ctx.from!.username ?? null,
      encryptedToken
    );

    // Reload user
    ctx.user = db
      .prepare("SELECT * FROM users WHERE telegram_id = ?")
      .get(ctx.from!.id) as any;

    ctx.session.onboardingStep = undefined;

    await ctx.reply(
      `✅ Connected as *${githubUser.login}*! Here's your main menu:`,
      {
        parse_mode: "Markdown",
        reply_markup: mainMenuKeyboard(),
      }
    );
  } catch (error) {
    await ctx.reply(
      "❌ Invalid token. Please check the token and try again.\n\n" +
        "Make sure it has `repo` and `read:org` scopes."
    );
  }
}

export async function handleSettings(ctx: BotContext): Promise<void> {
  if (!ctx.user) {
    await ctx.reply("Please /start first.");
    return;
  }

  await ctx.reply(
    "⚙️ *Settings*\n\nUpdate your GitHub token or manage preferences.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔑 Update GitHub Token", callback_data: "settings:update_token" }],
          [{ text: "◀️ Back to Menu", callback_data: "menu:main" }],
        ],
      },
    }
  );
}

export async function handleUpdateToken(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Send me your new GitHub Personal Access Token.\n" +
      "I'll encrypt and store it securely."
  );
  ctx.session.onboardingStep = "awaiting_token";
}
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/auth/
git commit -m "feat(auth): add types, middleware, and onboarding handlers

AuthMiddleware loads user from DB and gates access.
Onboarding flow: /start → send token → validate via GitHub API →
encrypt and store → show main menu."
```

---

## Task 5: Utility — Telegram Message Helpers

**Files:**
- Create: `src/utils/telegram.ts`
- Create: `tests/telegram.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/telegram.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { chunkMessage, escapeMarkdown } from "../src/utils/telegram.js";

describe("chunkMessage", () => {
  it("returns single chunk for short message", () => {
    const chunks = chunkMessage("Hello world");
    expect(chunks).toEqual(["Hello world"]);
  });

  it("splits long message at newline boundaries", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}: ${"x".repeat(50)}`);
    const message = lines.join("\n");
    const chunks = chunkMessage(message, 500);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
    expect(chunks.join("\n")).toBe(message);
  });

  it("hard-splits lines exceeding max length", () => {
    const longLine = "x".repeat(5000);
    const chunks = chunkMessage(longLine, 4096);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.length).toBe(4096);
  });
});

describe("escapeMarkdown", () => {
  it("escapes MarkdownV2 special characters", () => {
    expect(escapeMarkdown("hello_world")).toBe("hello\\_world");
    expect(escapeMarkdown("a*b*c")).toBe("a\\*b\\*c");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/telegram.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/telegram.ts`:
```typescript
const TELEGRAM_MAX_LENGTH = 4096;

export function chunkMessage(
  text: string,
  maxLength: number = TELEGRAM_MAX_LENGTH
): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  const lines = text.split("\n");
  let current = "";

  for (const line of lines) {
    // If a single line is too long, hard-split it
    if (line.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength));
      }
      continue;
    }

    const wouldBe = current ? current + "\n" + line : line;
    if (wouldBe.length > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current = wouldBe;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

const MARKDOWN_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL, "\\$1");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/telegram.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/telegram.ts tests/telegram.test.ts
git commit -m "feat(utils): add Telegram message chunking and markdown escape

chunkMessage splits at newline boundaries, hard-splits oversized lines.
escapeMarkdown handles MarkdownV2 special characters."
```

---

## Task 6: Utility — Copilot Models API Client

**Files:**
- Create: `src/utils/copilot-api.ts`
- Create: `tests/copilot-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/copilot-api.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { CopilotClient } from "../src/utils/copilot-api.js";

// We'll test the message building logic, not actual HTTP calls
describe("CopilotClient", () => {
  it("constructs with token and default model", () => {
    const client = new CopilotClient("ghp_test123");
    expect(client).toBeDefined();
  });

  it("builds messages array correctly", () => {
    const client = new CopilotClient("ghp_test123");
    const messages = client.buildMessages(
      "You are a helpful assistant.",
      [{ role: "user", content: "Hello" }]
    );
    expect(messages).toEqual([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" },
    ]);
  });

  it("builds messages with conversation history", () => {
    const client = new CopilotClient("ghp_test123");
    const messages = client.buildMessages("System prompt", [
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Follow-up" },
    ]);
    expect(messages).toHaveLength(4); // system + 3 conversation
    expect(messages[0]!.role).toBe("system");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/copilot-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/copilot-api.ts`:
```typescript
import { config } from "../config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
}

export class CopilotClient {
  private token: string;
  private model: string;
  private apiUrl: string;

  constructor(
    token: string,
    model: string = config.copilotModel,
    apiUrl: string = config.copilotApiUrl
  ) {
    this.token = token;
    this.model = model;
    this.apiUrl = apiUrl;
  }

  buildMessages(
    systemPrompt: string,
    conversation: Omit<ChatMessage, "role" & { role: "system" }>[]
  ): ChatMessage[] {
    return [
      { role: "system", content: systemPrompt },
      ...(conversation as ChatMessage[]),
    ];
  }

  async chatCompletion(
    systemPrompt: string,
    conversation: ChatMessage[]
  ): Promise<string> {
    const messages = this.buildMessages(systemPrompt, conversation);

    const response = await fetch(
      `${this.apiUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.3,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Copilot API error (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Copilot API returned empty response");
    }
    return content;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/copilot-api.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/copilot-api.ts tests/copilot-api.test.ts
git commit -m "feat(utils): add Copilot Models API client

CopilotClient wraps the GitHub Models API with chat completions.
Supports system prompts, conversation history, and configurable model."
```

---

## Task 7: UI — Keyboards, Menus, Pagination

**Files:**
- Create: `src/ui/keyboards.ts`
- Create: `src/ui/menus.ts`
- Create: `src/ui/pagination.ts`
- Create: `tests/pagination.test.ts`

- [ ] **Step 1: Write the failing pagination test**

Create `tests/pagination.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { paginate } from "../src/ui/pagination.js";

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => `item-${i}`);

  it("returns first page with 10 items", () => {
    const result = paginate(items, 1, 10);
    expect(result.items).toHaveLength(10);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
  });

  it("returns last page with remaining items", () => {
    const result = paginate(items, 3, 10);
    expect(result.items).toHaveLength(5);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(true);
  });

  it("clamps page to valid range", () => {
    const result = paginate(items, 99, 10);
    expect(result.page).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pagination.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create src/ui/pagination.ts**

```typescript
export interface PaginatedResult<T> {
  items: T[];
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function paginate<T>(
  allItems: T[],
  page: number,
  perPage: number = 10
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(allItems.length / perPage));
  const clampedPage = Math.max(1, Math.min(page, totalPages));
  const start = (clampedPage - 1) * perPage;
  const items = allItems.slice(start, start + perPage);

  return {
    items,
    page: clampedPage,
    totalPages,
    hasNext: clampedPage < totalPages,
    hasPrev: clampedPage > 1,
  };
}
```

- [ ] **Step 4: Run pagination test to verify it passes**

Run: `npx vitest run tests/pagination.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Create src/ui/keyboards.ts**

```typescript
import type { InlineKeyboardButton } from "grammy/types";

type Row = InlineKeyboardButton[];

export function mainMenuKeyboard(): { inline_keyboard: Row[] } {
  return {
    inline_keyboard: [
      [
        { text: "📂 Repos", callback_data: "menu:repos" },
        { text: "💬 AI Chat", callback_data: "menu:chat" },
      ],
      [
        { text: "⚙️ Settings", callback_data: "menu:settings" },
        { text: "❓ Help", callback_data: "menu:help" },
      ],
    ],
  };
}

export function repoMenuKeyboard(repoId: number): { inline_keyboard: Row[] } {
  return {
    inline_keyboard: [
      [
        { text: "🔀 PRs", callback_data: `repo:${repoId}:prs` },
        { text: "🐛 Issues", callback_data: `repo:${repoId}:issues` },
      ],
      [
        { text: "🌿 Branches", callback_data: `repo:${repoId}:branches` },
        { text: "🤖 New Feature", callback_data: `repo:${repoId}:codegen` },
      ],
      [{ text: "◀️ Back to Repos", callback_data: "menu:repos" }],
    ],
  };
}

export function prDetailKeyboard(
  repoId: number,
  prNumber: number
): { inline_keyboard: Row[] } {
  return {
    inline_keyboard: [
      [
        { text: "📄 Diff", callback_data: `pr:${repoId}:${prNumber}:diff` },
        { text: "🤖 Review", callback_data: `pr:${repoId}:${prNumber}:review` },
        { text: "💬 Comments", callback_data: `pr:${repoId}:${prNumber}:comments` },
      ],
      [
        { text: "✅ Approve", callback_data: `pr:${repoId}:${prNumber}:approve` },
        { text: "🔀 Merge", callback_data: `pr:${repoId}:${prNumber}:merge` },
        { text: "◀️ Back", callback_data: `repo:${repoId}:prs` },
      ],
    ],
  };
}

export function paginationRow(
  prefix: string,
  page: number,
  hasNext: boolean,
  hasPrev: boolean
): Row {
  const row: Row = [];
  if (hasPrev) {
    row.push({ text: "◀️ Prev", callback_data: `${prefix}:page:${page - 1}` });
  }
  row.push({ text: `${page}`, callback_data: "noop" });
  if (hasNext) {
    row.push({ text: "Next ▶️", callback_data: `${prefix}:page:${page + 1}` });
  }
  return row;
}

export function codegenReviewKeyboard(jobId: string): { inline_keyboard: Row[] } {
  return {
    inline_keyboard: [
      [
        { text: "✅ Create PR", callback_data: `codegen:${jobId}:create_pr` },
        { text: "📄 View Full Diff", callback_data: `codegen:${jobId}:diff` },
      ],
      [
        { text: "🔄 Revise", callback_data: `codegen:${jobId}:revise` },
        { text: "❌ Cancel", callback_data: `codegen:${jobId}:cancel` },
      ],
    ],
  };
}

export function chatKeyboard(): { inline_keyboard: Row[] } {
  return {
    inline_keyboard: [
      [
        { text: "🔄 New Chat", callback_data: "chat:new" },
        { text: "◀️ Back", callback_data: "menu:main" },
      ],
    ],
  };
}
```

- [ ] **Step 6: Create src/ui/menus.ts**

```typescript
import type { BotContext } from "../modules/auth/types.js";
import { mainMenuKeyboard } from "./keyboards.js";

export async function showMainMenu(ctx: BotContext): Promise<void> {
  const text = "🏠 *Main Menu*\n\nWhat would you like to do?";

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(),
    });
  }
}

export async function showHelp(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "❓ *Help*\n\n" +
      "📂 *Repos* — Browse your GitHub repositories\n" +
      "🔀 *PRs* — View and manage pull requests\n" +
      "🐛 *Issues* — Browse repository issues\n" +
      "🤖 *New Feature* — AI generates code and creates a PR\n" +
      "💬 *AI Chat* — Chat with AI about anything\n" +
      "⚙️ *Settings* — Update your GitHub token\n\n" +
      "Use /start to reset your session.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to Menu", callback_data: "menu:main" }],
        ],
      },
    }
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/ tests/pagination.test.ts
git commit -m "feat(ui): add inline keyboards, menus, and pagination

Keyboards for main menu, repo context, PR detail, codegen review,
and chat. Pagination helper with prev/next navigation buttons."
```

---

## Task 8: GitHub Module

**Files:**
- Create: `src/modules/github/types.ts`
- Create: `src/modules/github/client.ts`
- Create: `src/modules/github/formatters.ts`
- Create: `src/modules/github/handlers.ts`
- Create: `tests/formatters.test.ts`

- [ ] **Step 1: Write the failing formatters test**

Create `tests/formatters.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  formatRepoList,
  formatIssue,
  formatPrSummary,
} from "../src/modules/github/formatters.js";

describe("formatRepoList", () => {
  it("formats repos with owner/name", () => {
    const repos = [
      { full_name: "user/repo1", description: "A cool project" },
      { full_name: "user/repo2", description: null },
    ];
    const result = formatRepoList(repos);
    expect(result).toContain("user/repo1");
    expect(result).toContain("A cool project");
    expect(result).toContain("user/repo2");
  });
});

describe("formatIssue", () => {
  it("formats issue with number, title, and labels", () => {
    const result = formatIssue({
      number: 42,
      title: "Bug in login",
      state: "open",
      labels: ["bug", "urgent"],
      user: "john",
    });
    expect(result).toContain("#42");
    expect(result).toContain("Bug in login");
    expect(result).toContain("bug");
  });
});

describe("formatPrSummary", () => {
  it("formats PR with status info", () => {
    const result = formatPrSummary({
      number: 10,
      title: "Add feature",
      state: "open",
      user: "jane",
      head: "feature/add",
      base: "main",
    });
    expect(result).toContain("#10");
    expect(result).toContain("Add feature");
    expect(result).toContain("main ← feature/add");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/formatters.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create src/modules/github/types.ts**

```typescript
export interface RepoInfo {
  full_name: string;
  description: string | null;
}

export interface IssueInfo {
  number: number;
  title: string;
  state: string;
  labels: string[];
  user: string;
}

export interface PrInfo {
  number: number;
  title: string;
  state: string;
  user: string;
  head: string;
  base: string;
}

export interface BranchInfo {
  name: string;
  protected: boolean;
}
```

- [ ] **Step 4: Create src/modules/github/formatters.ts**

```typescript
import type { RepoInfo, IssueInfo, PrInfo, BranchInfo } from "./types.js";

export function formatRepoList(repos: RepoInfo[]): string {
  if (repos.length === 0) return "No repositories found.";

  return repos
    .map((r) => {
      const desc = r.description ? ` — ${r.description}` : "";
      return `📂 *${r.full_name}*${desc}`;
    })
    .join("\n\n");
}

export function formatIssue(issue: IssueInfo): string {
  const labels = issue.labels.length
    ? ` [${issue.labels.join(", ")}]`
    : "";
  const stateEmoji = issue.state === "open" ? "🟢" : "🔴";
  return `${stateEmoji} *#${issue.number}* ${issue.title}${labels}\nBy @${issue.user}`;
}

export function formatIssueList(issues: IssueInfo[]): string {
  if (issues.length === 0) return "No issues found.";
  return issues.map(formatIssue).join("\n\n");
}

export function formatPrSummary(pr: PrInfo): string {
  const stateEmoji = pr.state === "open" ? "🟢" : "🟣";
  return (
    `${stateEmoji} *#${pr.number}* ${pr.title}\n` +
    `By @${pr.user} | ${pr.base} ← ${pr.head}`
  );
}

export function formatPrList(prs: PrInfo[]): string {
  if (prs.length === 0) return "No pull requests found.";
  return prs.map(formatPrSummary).join("\n\n");
}

export function formatBranchList(branches: BranchInfo[]): string {
  if (branches.length === 0) return "No branches found.";
  return branches
    .map((b) => {
      const lock = b.protected ? " 🔒" : "";
      return `🌿 ${b.name}${lock}`;
    })
    .join("\n");
}
```

- [ ] **Step 5: Run formatters test to verify it passes**

Run: `npx vitest run tests/formatters.test.ts`
Expected: 3 tests PASS

- [ ] **Step 6: Create src/modules/github/client.ts**

```typescript
import { Octokit } from "@octokit/rest";
import { decrypt } from "../auth/crypto.js";
import { config } from "../../config.js";
import type { UserRecord } from "../auth/types.js";
import type { RepoInfo, IssueInfo, PrInfo, BranchInfo } from "./types.js";

export function createOctokit(user: UserRecord): Octokit {
  const token = decrypt(user.github_token_enc, config.encryptionKey);
  return new Octokit({ auth: token });
}

export async function listUserRepos(
  octokit: Octokit
): Promise<RepoInfo[]> {
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 100,
  });
  return data.map((r) => ({
    full_name: r.full_name,
    description: r.description,
  }));
}

export async function listIssues(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<IssueInfo[]> {
  const { data } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: "open",
    per_page: 30,
  });
  // Filter out pull requests (GitHub returns PRs in issues endpoint)
  return data
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: i.labels.map((l) =>
        typeof l === "string" ? l : l.name ?? ""
      ),
      user: i.user?.login ?? "unknown",
    }));
}

export async function listPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<PrInfo[]> {
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 30,
  });
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    user: pr.user?.login ?? "unknown",
    head: pr.head.ref,
    base: pr.base.ref,
  }));
}

export async function getPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrInfo> {
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    user: pr.user?.login ?? "unknown",
    head: pr.head.ref,
    base: pr.base.ref,
  };
}

export async function getPrDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });
  return data as unknown as string;
}

export async function listBranches(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<BranchInfo[]> {
  const { data } = await octokit.rest.repos.listBranches({
    owner,
    repo,
    per_page: 30,
  });
  return data.map((b) => ({
    name: b.name,
    protected: b.protected,
  }));
}
```

- [ ] **Step 7: Create src/modules/github/handlers.ts**

```typescript
import type { BotContext } from "../auth/types.js";
import { getDb } from "../../db/client.js";
import { createOctokit, listUserRepos, listIssues, listPullRequests, listBranches, getPullRequest, getPrDiff } from "./client.js";
import { formatRepoList, formatIssueList, formatPrList, formatPrSummary, formatBranchList } from "./formatters.js";
import { paginate } from "../../ui/pagination.js";
import { paginationRow, repoMenuKeyboard, prDetailKeyboard } from "../../ui/keyboards.js";
import { chunkMessage } from "../../utils/telegram.js";

export async function handleRepoList(ctx: BotContext, page: number = 1): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const octokit = createOctokit(ctx.user);
  const repos = await listUserRepos(octokit);

  // Cache repos in DB
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO repos (user_id, github_repo_id, full_name, default_branch, last_synced)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, github_repo_id) DO UPDATE SET
       full_name = excluded.full_name, last_synced = excluded.last_synced`
  );

  // We need a unique constraint for upsert — for now just delete and reinsert
  db.prepare("DELETE FROM repos WHERE user_id = ?").run(ctx.user.id);
  for (const repo of repos) {
    const [owner, name] = repo.full_name.split("/");
    upsert.run(ctx.user.id, 0, repo.full_name, null);
  }

  // Reload from DB to get IDs
  const dbRepos = db
    .prepare("SELECT id, full_name FROM repos WHERE user_id = ? ORDER BY last_synced DESC")
    .all(ctx.user.id) as Array<{ id: number; full_name: string }>;

  const paginated = paginate(dbRepos, page, 8);

  const buttons = paginated.items.map((r) => [
    { text: `📂 ${r.full_name}`, callback_data: `repo:${r.id}:select` },
  ]);

  const navRow = paginationRow("repos", paginated.page, paginated.hasNext, paginated.hasPrev);
  buttons.push(navRow);
  buttons.push([{ text: "◀️ Back to Menu", callback_data: "menu:main" }]);

  const text = `📂 *Your Repositories* (${paginated.page}/${paginated.totalPages})`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  }
}

export async function handleRepoSelect(ctx: BotContext, repoId: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?").get(repoId, ctx.user.id) as any;
  if (!repo) {
    await ctx.editMessageText("Repo not found.");
    return;
  }

  // Set as active repo
  db.prepare("UPDATE users SET active_repo_id = ? WHERE id = ?").run(repoId, ctx.user.id);
  ctx.user.active_repo_id = repoId;

  await ctx.editMessageText(`📂 *${repo.full_name}*\n\nWhat would you like to do?`, {
    parse_mode: "Markdown",
    reply_markup: repoMenuKeyboard(repoId),
  });
}

function getActiveRepo(ctx: BotContext, repoId: number): { owner: string; repo: string; full_name: string } | null {
  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?").get(repoId, ctx.user!.id) as any;
  if (!repo) return null;
  const [owner, repoName] = repo.full_name.split("/");
  return { owner, repo: repoName, full_name: repo.full_name };
}

export async function handleIssueList(ctx: BotContext, repoId: number, page: number = 1): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  const issues = await listIssues(octokit, repoInfo.owner, repoInfo.repo);
  const formatted = formatIssueList(issues);

  await ctx.editMessageText(
    `🐛 *Issues — ${repoInfo.full_name}*\n\n${formatted}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back", callback_data: `repo:${repoId}:select` }],
        ],
      },
    }
  );
}

export async function handlePrList(ctx: BotContext, repoId: number, page: number = 1): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  const prs = await listPullRequests(octokit, repoInfo.owner, repoInfo.repo);

  const buttons = prs.map((pr) => [
    { text: `#${pr.number} ${pr.title}`, callback_data: `pr:${repoId}:${pr.number}:detail` },
  ]);
  buttons.push([{ text: "◀️ Back", callback_data: `repo:${repoId}:select` }]);

  await ctx.editMessageText(`🔀 *Pull Requests — ${repoInfo.full_name}*`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

export async function handlePrDetail(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  const pr = await getPullRequest(octokit, repoInfo.owner, repoInfo.repo, prNumber);
  const text = formatPrSummary(pr);

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: prDetailKeyboard(repoId, prNumber),
  });
}

export async function handlePrDiff(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  const diff = await getPrDiff(octokit, repoInfo.owner, repoInfo.repo, prNumber);

  const chunks = chunkMessage(`\`\`\`diff\n${diff}\n\`\`\``, 4000);
  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: "Markdown" });
  }
}

export async function handleBranchList(ctx: BotContext, repoId: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  const branches = await listBranches(octokit, repoInfo.owner, repoInfo.repo);
  const formatted = formatBranchList(branches);

  await ctx.editMessageText(
    `🌿 *Branches — ${repoInfo.full_name}*\n\n${formatted}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back", callback_data: `repo:${repoId}:select` }],
        ],
      },
    }
  );
}

export async function handlePrApprove(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  await octokit.rest.pulls.createReview({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    pull_number: prNumber,
    event: "APPROVE",
  });

  await ctx.editMessageText(`✅ PR #${prNumber} approved!`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
      ],
    },
  });
}

export async function handlePrMerge(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  await ctx.answerCallbackQuery();

  await ctx.editMessageText(`🔀 Choose merge method for PR #${prNumber}:`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Merge Commit", callback_data: `pr:${repoId}:${prNumber}:merge:merge` },
          { text: "Squash", callback_data: `pr:${repoId}:${prNumber}:merge:squash` },
          { text: "Rebase", callback_data: `pr:${repoId}:${prNumber}:merge:rebase` },
        ],
        [{ text: "◀️ Cancel", callback_data: `pr:${repoId}:${prNumber}:detail` }],
      ],
    },
  });
}

export async function handlePrMergeConfirm(
  ctx: BotContext,
  repoId: number,
  prNumber: number,
  method: "merge" | "squash" | "rebase"
): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  try {
    await octokit.rest.pulls.merge({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      pull_number: prNumber,
      merge_method: method,
    });
    await ctx.editMessageText(`✅ PR #${prNumber} merged via ${method}!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to PRs", callback_data: `repo:${repoId}:prs` }],
        ],
      },
    });
  } catch (error: any) {
    await ctx.editMessageText(`❌ Failed to merge: ${error.message}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
        ],
      },
    });
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/github/ tests/formatters.test.ts
git commit -m "feat(github): add GitHub module with repo, issue, PR, branch handlers

Octokit client factory, formatters for Telegram display, handlers for
browsing repos, issues, PRs (list/detail/diff/approve/merge), and branches."
```

---

## Task 9: PR Review Module

**Files:**
- Create: `src/modules/review/types.ts`
- Create: `src/modules/review/prompts.ts`
- Create: `src/modules/review/handlers.ts`

- [ ] **Step 1: Create src/modules/review/types.ts**

```typescript
export interface ReviewResult {
  summary: string;
  issues: Array<{
    severity: "critical" | "warning" | "suggestion";
    file: string;
    line?: number;
    description: string;
  }>;
  approved: boolean;
}
```

- [ ] **Step 2: Create src/modules/review/prompts.ts**

```typescript
export const PR_REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer. Analyze the given pull request diff and provide a structured review.

Respond in this exact JSON format:
{
  "summary": "Brief 2-3 sentence summary of what this PR does",
  "issues": [
    {
      "severity": "critical|warning|suggestion",
      "file": "path/to/file.ts",
      "line": 42,
      "description": "Description of the issue"
    }
  ],
  "approved": true/false
}

Focus on:
- Bugs and logic errors (critical)
- Security vulnerabilities (critical)
- Performance issues (warning)
- Code quality improvements (suggestion)

Do NOT comment on formatting or style. Only flag things that matter.
Respond with valid JSON only, no markdown fences.`;
```

- [ ] **Step 3: Create src/modules/review/handlers.ts**

```typescript
import type { BotContext } from "../auth/types.js";
import { createOctokit, getPrDiff, getPullRequest } from "../github/client.js";
import { getDb } from "../../db/client.js";
import { decrypt } from "../auth/crypto.js";
import { config } from "../../config.js";
import { CopilotClient } from "../../utils/copilot-api.js";
import type { ReviewResult } from "./types.js";
import { PR_REVIEW_SYSTEM_PROMPT } from "./prompts.js";

export async function handlePrReview(
  ctx: BotContext,
  repoId: number,
  prNumber: number
): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?").get(repoId, ctx.user.id) as any;
  if (!repo) return;

  const [owner, repoName] = repo.full_name.split("/");
  const octokit = createOctokit(ctx.user);

  await ctx.editMessageText("🤖 Analyzing PR... This may take a moment.");

  try {
    const [pr, diff] = await Promise.all([
      getPullRequest(octokit, owner, repoName, prNumber),
      getPrDiff(octokit, owner, repoName, prNumber),
    ]);

    const token = decrypt(ctx.user.github_token_enc, config.encryptionKey);
    const copilot = new CopilotClient(token);

    const userMessage = `Review this pull request:\n\nTitle: ${pr.title}\nBranch: ${pr.head} → ${pr.base}\n\nDiff:\n${diff}`;

    const response = await copilot.chatCompletion(PR_REVIEW_SYSTEM_PROMPT, [
      { role: "user", content: userMessage },
    ]);

    let review: ReviewResult;
    try {
      review = JSON.parse(response);
    } catch {
      // If AI didn't return valid JSON, show raw response
      await ctx.editMessageText(`🤖 *AI Review*\n\n${response}`, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
          ],
        },
      });
      return;
    }

    const severityEmoji = { critical: "🔴", warning: "🟡", suggestion: "💡" };

    let text = `🤖 *AI Review — PR #${prNumber}*\n\n`;
    text += `📝 ${review.summary}\n\n`;

    if (review.issues.length === 0) {
      text += "✅ No issues found!\n";
    } else {
      for (const issue of review.issues) {
        const emoji = severityEmoji[issue.severity] ?? "❓";
        const line = issue.line ? `:${issue.line}` : "";
        text += `${emoji} *${issue.file}${line}*\n${issue.description}\n\n`;
      }
    }

    text += review.approved ? "\n✅ *Recommendation: Approve*" : "\n⚠️ *Recommendation: Request Changes*";

    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve PR", callback_data: `pr:${repoId}:${prNumber}:approve` },
            { text: "💬 Post as Comment", callback_data: `pr:${repoId}:${prNumber}:post_review:${encodeURIComponent(review.summary)}` },
          ],
          [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
        ],
      },
    });
  } catch (error: any) {
    await ctx.editMessageText(`❌ Review failed: ${error.message}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
        ],
      },
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/review/
git commit -m "feat(review): add AI-powered PR review module

Fetches PR diff, sends to Copilot Models API for structured review.
Displays summary, issues with severity, and approve/request changes
recommendation via inline keyboard."
```

---

## Task 10: CodeGen Module

**Files:**
- Create: `src/modules/codegen/types.ts`
- Create: `src/modules/codegen/prompts.ts`
- Create: `src/modules/codegen/git.ts`
- Create: `src/modules/codegen/worker.ts`
- Create: `src/modules/codegen/handlers.ts`
- Create: `tests/git.test.ts`

- [ ] **Step 1: Create src/modules/codegen/types.ts**

```typescript
export interface FileChange {
  action: "create" | "modify" | "delete";
  path: string;
  content?: string; // required for create/modify
}

export interface CodeGenResult {
  summary: string;
  files: FileChange[];
  commitMessage: string;
}

export interface CodeGenJob {
  id: string;
  user_id: number;
  repo_id: number;
  description: string;
  status: string;
  branch_name: string | null;
  pr_url: string | null;
  workspace_path: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Create src/modules/codegen/prompts.ts**

```typescript
export function buildCodeGenSystemPrompt(repoStructure: string): string {
  return `You are an expert software engineer. The user will describe a feature they want added to a repository.

Repository structure:
${repoStructure}

Respond with a JSON object in this exact format:
{
  "summary": "Brief description of what changes you made",
  "files": [
    {
      "action": "create|modify|delete",
      "path": "relative/path/to/file.ts",
      "content": "full file content for create/modify, omit for delete"
    }
  ],
  "commitMessage": "feat: descriptive commit message"
}

Rules:
- For "modify" actions, provide the COMPLETE new file content (not a diff)
- Use existing project conventions (language, style, patterns)
- Keep changes minimal and focused on the requested feature
- Write production-quality code with proper error handling
- Respond with valid JSON only, no markdown fences`;
}

export const CODEGEN_REVISION_PROMPT = `The user has reviewed your code changes and wants revisions. Apply their feedback and respond with the same JSON format as before, with updated files.`;
```

- [ ] **Step 3: Create src/modules/codegen/git.ts**

```typescript
import { execa } from "execa";
import { mkdir, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export async function cloneRepo(
  repoUrl: string,
  targetDir: string,
  token: string
): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  // Insert token into URL for auth
  const authedUrl = repoUrl.replace(
    "https://github.com/",
    `https://x-access-token:${token}@github.com/`
  );

  await execa("git", ["clone", "--depth", "1", authedUrl, targetDir]);
}

export async function createBranch(
  workDir: string,
  branchName: string
): Promise<void> {
  await execa("git", ["checkout", "-b", branchName], { cwd: workDir });
}

export async function commitAll(
  workDir: string,
  message: string
): Promise<void> {
  await execa("git", ["add", "-A"], { cwd: workDir });
  await execa("git", ["commit", "-m", message], { cwd: workDir });
}

export async function pushBranch(
  workDir: string,
  branchName: string
): Promise<void> {
  await execa("git", ["push", "origin", branchName], { cwd: workDir });
}

export async function getRepoTree(
  workDir: string,
  maxDepth: number = 3
): Promise<string> {
  const lines: string[] = [];

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        lines.push(`${prefix}${entry.name}/`);
        await walk(fullPath, prefix + "  ", depth + 1);
      } else {
        lines.push(`${prefix}${entry.name}`);
      }
    }
  }

  await walk(workDir, "", 0);
  return lines.join("\n");
}

export async function cleanupWorkspace(workDir: string): Promise<void> {
  try {
    await rm(workDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}
```

- [ ] **Step 4: Write the git test**

Create `tests/git.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { getRepoTree, cleanupWorkspace } from "../src/modules/codegen/git.js";

const TEST_DIR = join("/tmp", "git-test-" + Date.now());

describe("getRepoTree", () => {
  beforeEach(async () => {
    await mkdir(join(TEST_DIR, "src", "utils"), { recursive: true });
    await writeFile(join(TEST_DIR, "package.json"), "{}");
    await writeFile(join(TEST_DIR, "src", "index.ts"), "");
    await writeFile(join(TEST_DIR, "src", "utils", "helper.ts"), "");
    await mkdir(join(TEST_DIR, ".git"), { recursive: true });
    await mkdir(join(TEST_DIR, "node_modules"), { recursive: true });
  });

  afterEach(async () => {
    await cleanupWorkspace(TEST_DIR);
  });

  it("lists files excluding .git and node_modules", async () => {
    const tree = await getRepoTree(TEST_DIR);
    expect(tree).toContain("package.json");
    expect(tree).toContain("src/");
    expect(tree).toContain("index.ts");
    expect(tree).not.toContain(".git");
    expect(tree).not.toContain("node_modules");
  });
});

describe("cleanupWorkspace", () => {
  it("removes directory and does not throw if missing", async () => {
    const dir = join("/tmp", "cleanup-test-" + Date.now());
    await mkdir(dir, { recursive: true });
    await cleanupWorkspace(dir);
    await expect(cleanupWorkspace(dir)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 5: Run git test**

Run: `npx vitest run tests/git.test.ts`
Expected: PASS

- [ ] **Step 6: Create src/modules/codegen/worker.ts**

```typescript
import { writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FileChange } from "./types.js";

export async function applyFileChanges(
  workDir: string,
  changes: FileChange[]
): Promise<void> {
  for (const change of changes) {
    const fullPath = join(workDir, change.path);

    switch (change.action) {
      case "create":
      case "modify":
        if (!change.content) {
          throw new Error(`Missing content for ${change.action}: ${change.path}`);
        }
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, change.content, "utf-8");
        break;

      case "delete":
        try {
          await rm(fullPath);
        } catch {
          // File may not exist
        }
        break;
    }
  }
}
```

- [ ] **Step 7: Create src/modules/codegen/handlers.ts**

```typescript
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { BotContext } from "../auth/types.js";
import { getDb } from "../../db/client.js";
import { decrypt } from "../auth/crypto.js";
import { config } from "../../config.js";
import { createOctokit } from "../github/client.js";
import { CopilotClient } from "../../utils/copilot-api.js";
import { cloneRepo, createBranch, commitAll, pushBranch, getRepoTree, cleanupWorkspace } from "./git.js";
import { applyFileChanges } from "./worker.js";
import { buildCodeGenSystemPrompt, CODEGEN_REVISION_PROMPT } from "./prompts.js";
import { codegenReviewKeyboard } from "../../ui/keyboards.js";
import { chunkMessage } from "../../utils/telegram.js";
import type { CodeGenResult, CodeGenJob } from "./types.js";

export async function handleCodeGenStart(ctx: BotContext, repoId: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  // Check for existing active job
  const db = getDb();
  const activeJob = db
    .prepare("SELECT * FROM codegen_jobs WHERE user_id = ? AND status IN ('pending', 'running', 'review')")
    .get(ctx.user.id) as CodeGenJob | undefined;

  if (activeJob) {
    await ctx.editMessageText("⚠️ You already have an active code generation job. Please finish or cancel it first.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back", callback_data: `repo:${repoId}:select` }],
        ],
      },
    });
    return;
  }

  ctx.session.codegenAwaitingDescription = true;

  const repo = db.prepare("SELECT * FROM repos WHERE id = ?").get(repoId) as any;
  await ctx.editMessageText(
    `🤖 *New Feature — ${repo.full_name}*\n\nDescribe what you want to build:`,
    { parse_mode: "Markdown" }
  );
}

export async function handleCodeGenDescription(ctx: BotContext): Promise<void> {
  if (!ctx.session.codegenAwaitingDescription || !ctx.user) return;

  const description = ctx.message?.text?.trim();
  if (!description) return;

  ctx.session.codegenAwaitingDescription = false;

  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?")
    .get(ctx.user.active_repo_id, ctx.user.id) as any;

  if (!repo) {
    await ctx.reply("❌ No active repo selected.");
    return;
  }

  const jobId = randomUUID();
  const branchName = `feature/${description.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${jobId.slice(0, 6)}`;
  const workspacePath = join(config.codegenDir, jobId);

  db.prepare(
    `INSERT INTO codegen_jobs (id, user_id, repo_id, description, status, branch_name, workspace_path)
     VALUES (?, ?, ?, ?, 'running', ?, ?)`
  ).run(jobId, ctx.user.id, repo.id, description, branchName, workspacePath);

  ctx.session.codegenJobId = jobId;

  await ctx.reply("🔄 Working on it... Cloning repo, analyzing code, generating changes...");

  try {
    const token = decrypt(ctx.user.github_token_enc, config.encryptionKey);

    // Clone
    await cloneRepo(`https://github.com/${repo.full_name}.git`, workspacePath, token);
    await createBranch(workspacePath, branchName);

    // Get repo structure for context
    const repoTree = await getRepoTree(workspacePath);
    const systemPrompt = buildCodeGenSystemPrompt(repoTree);

    // Call AI
    const copilot = new CopilotClient(token);
    const response = await copilot.chatCompletion(systemPrompt, [
      { role: "user", content: description },
    ]);

    let result: CodeGenResult;
    try {
      result = JSON.parse(response);
    } catch {
      throw new Error("AI returned invalid response format");
    }

    // Apply changes
    await applyFileChanges(workspacePath, result.files);
    await commitAll(workspacePath, result.commitMessage);

    // Update job status
    db.prepare("UPDATE codegen_jobs SET status = 'review' WHERE id = ?").run(jobId);

    // Show summary
    const fileList = result.files
      .map((f) => `${f.action === "create" ? "➕" : f.action === "modify" ? "📝" : "🗑️"} ${f.path}`)
      .join("\n");

    await ctx.reply(
      `✅ *Changes ready for review*\n\n📝 ${result.summary}\n\n*Files changed:*\n${fileList}`,
      {
        parse_mode: "Markdown",
        reply_markup: codegenReviewKeyboard(jobId),
      }
    );
  } catch (error: any) {
    db.prepare("UPDATE codegen_jobs SET status = 'failed' WHERE id = ?").run(jobId);
    await cleanupWorkspace(workspacePath);
    await ctx.reply(`❌ Code generation failed: ${error.message}`);
  }
}

export async function handleCodeGenDiff(ctx: BotContext, jobId: string): Promise<void> {
  await ctx.answerCallbackQuery();

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ?").get(jobId) as CodeGenJob | undefined;
  if (!job?.workspace_path) return;

  try {
    const { execa: execaFn } = await import("execa");
    const { stdout } = await execaFn("git", ["diff", "HEAD~1"], { cwd: job.workspace_path });
    const chunks = chunkMessage(`\`\`\`diff\n${stdout}\n\`\`\``, 4000);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
  } catch (error: any) {
    await ctx.reply(`❌ Failed to get diff: ${error.message}`);
  }
}

export async function handleCodeGenRevise(ctx: BotContext, jobId: string): Promise<void> {
  await ctx.answerCallbackQuery();
  ctx.session.codegenJobId = jobId;
  ctx.session.codegenAwaitingRevision = true;
  await ctx.reply("🔄 Describe what changes you want:");
}

export async function handleCodeGenRevisionInput(ctx: BotContext): Promise<void> {
  if (!ctx.session.codegenAwaitingRevision || !ctx.user) return;

  const feedback = ctx.message?.text?.trim();
  if (!feedback) return;

  ctx.session.codegenAwaitingRevision = false;
  const jobId = ctx.session.codegenJobId;
  if (!jobId) return;

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ? AND user_id = ?")
    .get(jobId, ctx.user.id) as CodeGenJob | undefined;
  if (!job?.workspace_path) return;

  await ctx.reply("🔄 Revising code...");

  try {
    const token = decrypt(ctx.user.github_token_enc, config.encryptionKey);
    const repoTree = await getRepoTree(job.workspace_path);
    const systemPrompt = buildCodeGenSystemPrompt(repoTree) + "\n\n" + CODEGEN_REVISION_PROMPT;

    const copilot = new CopilotClient(token);
    const response = await copilot.chatCompletion(systemPrompt, [
      { role: "user", content: job.description },
      { role: "assistant", content: "I made the initial changes." },
      { role: "user", content: `Revision requested: ${feedback}` },
    ]);

    const result: CodeGenResult = JSON.parse(response);
    await applyFileChanges(job.workspace_path, result.files);
    await commitAll(job.workspace_path, `refactor: ${result.commitMessage}`);

    const fileList = result.files
      .map((f) => `${f.action === "create" ? "➕" : f.action === "modify" ? "📝" : "🗑️"} ${f.path}`)
      .join("\n");

    await ctx.reply(
      `✅ *Revision complete*\n\n📝 ${result.summary}\n\n*Files changed:*\n${fileList}`,
      {
        parse_mode: "Markdown",
        reply_markup: codegenReviewKeyboard(jobId),
      }
    );
  } catch (error: any) {
    await ctx.reply(`❌ Revision failed: ${error.message}`);
  }
}

export async function handleCodeGenCreatePr(ctx: BotContext, jobId: string): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ? AND user_id = ?")
    .get(jobId, ctx.user.id) as CodeGenJob | undefined;
  if (!job?.workspace_path || !job.branch_name) return;

  const repo = db.prepare("SELECT * FROM repos WHERE id = ?").get(job.repo_id) as any;
  if (!repo) return;

  await ctx.editMessageText("🔄 Pushing branch and creating PR...");

  try {
    await pushBranch(job.workspace_path, job.branch_name);

    const [owner, repoName] = repo.full_name.split("/");
    const octokit = createOctokit(ctx.user);

    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo: repoName,
      title: job.description,
      body: `🤖 Auto-generated by Telegram GitHub Bot\n\n${job.description}`,
      head: job.branch_name,
      base: repo.default_branch ?? "main",
    });

    db.prepare("UPDATE codegen_jobs SET status = 'done', pr_url = ? WHERE id = ?")
      .run(pr.html_url, jobId);

    await cleanupWorkspace(job.workspace_path);

    await ctx.editMessageText(
      `✅ *PR Created!*\n\n🔗 [PR #${pr.number}: ${job.description}](${pr.html_url})`,
      { parse_mode: "Markdown" }
    );
  } catch (error: any) {
    await ctx.editMessageText(`❌ Failed to create PR: ${error.message}`);
  }
}

export async function handleCodeGenCancel(ctx: BotContext, jobId: string): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ? AND user_id = ?")
    .get(jobId, ctx.user.id) as CodeGenJob | undefined;

  if (job?.workspace_path) {
    await cleanupWorkspace(job.workspace_path);
  }

  db.prepare("UPDATE codegen_jobs SET status = 'cancelled' WHERE id = ?").run(jobId);
  ctx.session.codegenJobId = undefined;

  await ctx.editMessageText("❌ Code generation cancelled.", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "◀️ Back to Menu", callback_data: "menu:main" }],
      ],
    },
  });
}
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/codegen/ tests/git.test.ts
git commit -m "feat(codegen): add AI code generation module

Clone repo, generate code via Copilot Models API, apply changes,
review with inline keyboard, revise iteratively, push and create PR.
Includes git operations helper and workspace cleanup."
```

---

## Task 11: AI Chat Module

**Files:**
- Create: `src/modules/chat/types.ts`
- Create: `src/modules/chat/prompts.ts`
- Create: `src/modules/chat/handlers.ts`

- [ ] **Step 1: Create src/modules/chat/types.ts**

```typescript
export interface ChatSession {
  sessionId: string;
  userId: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}
```

- [ ] **Step 2: Create src/modules/chat/prompts.ts**

```typescript
export function buildChatSystemPrompt(repoContext?: string): string {
  let prompt = `You are a helpful AI assistant accessible via Telegram. You help developers with coding questions, debugging, architecture decisions, and general software engineering topics.

Be concise — Telegram messages should be brief and readable. Use markdown formatting sparingly.`;

  if (repoContext) {
    prompt += `\n\nThe user is currently working on this repository: ${repoContext}. You may reference it when relevant.`;
  }

  return prompt;
}
```

- [ ] **Step 3: Create src/modules/chat/handlers.ts**

```typescript
import { randomUUID } from "node:crypto";
import type { BotContext } from "../auth/types.js";
import { getDb } from "../../db/client.js";
import { decrypt } from "../auth/crypto.js";
import { config } from "../../config.js";
import { CopilotClient } from "../../utils/copilot-api.js";
import { buildChatSystemPrompt } from "./prompts.js";
import { chatKeyboard } from "../../ui/keyboards.js";
import type { ChatMessage } from "../../utils/copilot-api.js";

export async function handleChatStart(ctx: BotContext): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  // Create new chat session
  const sessionId = randomUUID();
  ctx.session.chatSessionId = sessionId;

  const text = "💬 *AI Chat*\n\nSend me any message and I'll respond. I can help with coding, debugging, architecture, and more.";

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: chatKeyboard(),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: chatKeyboard(),
    });
  }
}

export async function handleNewChat(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  ctx.session.chatSessionId = randomUUID();
  await ctx.editMessageText("💬 *New Chat Started*\n\nSend me a message!", {
    parse_mode: "Markdown",
    reply_markup: chatKeyboard(),
  });
}

export async function handleChatMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.message?.text) return;

  // Skip if user is in another flow
  if (
    ctx.session.onboardingStep ||
    ctx.session.codegenAwaitingDescription ||
    ctx.session.codegenAwaitingRevision
  ) {
    return;
  }

  // If no active chat session, create one
  if (!ctx.session.chatSessionId) {
    ctx.session.chatSessionId = randomUUID();
  }

  const sessionId = ctx.session.chatSessionId;
  const userMessage = ctx.message.text;
  const db = getDb();

  // Save user message
  db.prepare(
    "INSERT INTO chat_messages (user_id, session_id, role, content) VALUES (?, ?, 'user', ?)"
  ).run(ctx.user.id, sessionId, userMessage);

  // Load conversation history
  const history = db
    .prepare(
      "SELECT role, content FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC"
    )
    .all(ctx.user.id, sessionId) as ChatMessage[];

  // Get repo context if active
  let repoContext: string | undefined;
  if (ctx.user.active_repo_id) {
    const repo = db.prepare("SELECT full_name FROM repos WHERE id = ?").get(ctx.user.active_repo_id) as any;
    if (repo) repoContext = repo.full_name;
  }

  try {
    const token = decrypt(ctx.user.github_token_enc, config.encryptionKey);
    const copilot = new CopilotClient(token);
    const systemPrompt = buildChatSystemPrompt(repoContext);

    const response = await copilot.chatCompletion(systemPrompt, history);

    // Save assistant response
    db.prepare(
      "INSERT INTO chat_messages (user_id, session_id, role, content) VALUES (?, ?, 'assistant', ?)"
    ).run(ctx.user.id, sessionId, response);

    await ctx.reply(response, {
      parse_mode: "Markdown",
      reply_markup: chatKeyboard(),
    });
  } catch (error: any) {
    await ctx.reply(`❌ Chat error: ${error.message}`, {
      reply_markup: chatKeyboard(),
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/chat/
git commit -m "feat(chat): add AI chat module with conversation history

Free-form chat with Copilot Models API. Maintains per-user conversation
history in SQLite. Repo-aware when user has an active project context."
```

---

## Task 12: Bot Assembly & Callback Router

**Files:**
- Create: `src/bot.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Create src/bot.ts**

```typescript
import { Bot, session } from "grammy";
import type { BotContext, SessionData } from "./modules/auth/types.js";
import { config } from "./config.js";
import { authMiddleware } from "./modules/auth/middleware.js";
import { handleStart, handleTokenInput, handleSettings, handleUpdateToken } from "./modules/auth/handlers.js";
import {
  handleRepoList, handleRepoSelect, handleIssueList,
  handlePrList, handlePrDetail, handlePrDiff,
  handleBranchList, handlePrApprove, handlePrMerge, handlePrMergeConfirm,
} from "./modules/github/handlers.js";
import { handlePrReview } from "./modules/review/handlers.js";
import {
  handleCodeGenStart, handleCodeGenDescription,
  handleCodeGenDiff, handleCodeGenRevise, handleCodeGenRevisionInput,
  handleCodeGenCreatePr, handleCodeGenCancel,
} from "./modules/codegen/handlers.js";
import { handleChatStart, handleNewChat, handleChatMessage } from "./modules/chat/handlers.js";
import { showMainMenu, showHelp } from "./ui/menus.js";

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.telegramBotToken);

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );

  // Auth middleware
  bot.use(authMiddleware);

  // Commands
  bot.command("start", handleStart);
  bot.command("help", (ctx) => showHelp(ctx));

  // Callback query router
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    try {
      // Menu navigation
      if (data === "menu:main") return showMainMenu(ctx);
      if (data === "menu:repos") return handleRepoList(ctx);
      if (data === "menu:chat") return handleChatStart(ctx);
      if (data === "menu:settings") return handleSettings(ctx);
      if (data === "menu:help") return showHelp(ctx);
      if (data === "noop") return ctx.answerCallbackQuery();

      // Settings
      if (data === "settings:update_token") return handleUpdateToken(ctx);

      // Chat
      if (data === "chat:new") return handleNewChat(ctx);

      // Repo pagination
      const repoPageMatch = data.match(/^repos:page:(\d+)$/);
      if (repoPageMatch) return handleRepoList(ctx, parseInt(repoPageMatch[1]!));

      // Repo selection
      const repoSelectMatch = data.match(/^repo:(\d+):select$/);
      if (repoSelectMatch) return handleRepoSelect(ctx, parseInt(repoSelectMatch[1]!));

      // Repo sub-menus
      const repoActionMatch = data.match(/^repo:(\d+):(prs|issues|branches|codegen)$/);
      if (repoActionMatch) {
        const repoId = parseInt(repoActionMatch[1]!);
        const action = repoActionMatch[2]!;
        if (action === "prs") return handlePrList(ctx, repoId);
        if (action === "issues") return handleIssueList(ctx, repoId);
        if (action === "branches") return handleBranchList(ctx, repoId);
        if (action === "codegen") return handleCodeGenStart(ctx, repoId);
      }

      // PR actions
      const prActionMatch = data.match(/^pr:(\d+):(\d+):(detail|diff|review|comments|approve|merge)$/);
      if (prActionMatch) {
        const repoId = parseInt(prActionMatch[1]!);
        const prNumber = parseInt(prActionMatch[2]!);
        const action = prActionMatch[3]!;
        if (action === "detail") return handlePrDetail(ctx, repoId, prNumber);
        if (action === "diff") return handlePrDiff(ctx, repoId, prNumber);
        if (action === "review") return handlePrReview(ctx, repoId, prNumber);
        if (action === "approve") return handlePrApprove(ctx, repoId, prNumber);
        if (action === "merge") return handlePrMerge(ctx, repoId, prNumber);
      }

      // PR merge method
      const mergeMatch = data.match(/^pr:(\d+):(\d+):merge:(merge|squash|rebase)$/);
      if (mergeMatch) {
        return handlePrMergeConfirm(
          ctx,
          parseInt(mergeMatch[1]!),
          parseInt(mergeMatch[2]!),
          mergeMatch[3]! as "merge" | "squash" | "rebase"
        );
      }

      // CodeGen actions
      const codegenMatch = data.match(/^codegen:([^:]+):(create_pr|diff|revise|cancel)$/);
      if (codegenMatch) {
        const jobId = codegenMatch[1]!;
        const action = codegenMatch[2]!;
        if (action === "create_pr") return handleCodeGenCreatePr(ctx, jobId);
        if (action === "diff") return handleCodeGenDiff(ctx, jobId);
        if (action === "revise") return handleCodeGenRevise(ctx, jobId);
        if (action === "cancel") return handleCodeGenCancel(ctx, jobId);
      }

      await ctx.answerCallbackQuery("Unknown action");
    } catch (error: any) {
      console.error("Callback error:", error);
      await ctx.answerCallbackQuery("Something went wrong");
    }
  });

  // Text message handler (catch-all)
  bot.on("message:text", async (ctx) => {
    // Onboarding token input
    if (ctx.session.onboardingStep === "awaiting_token") {
      return handleTokenInput(ctx);
    }

    // CodeGen description input
    if (ctx.session.codegenAwaitingDescription) {
      return handleCodeGenDescription(ctx);
    }

    // CodeGen revision input
    if (ctx.session.codegenAwaitingRevision) {
      return handleCodeGenRevisionInput(ctx);
    }

    // Default: AI chat
    return handleChatMessage(ctx);
  });

  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return bot;
}
```

- [ ] **Step 2: Create src/index.ts**

```typescript
import { config } from "./config.js";
import { initializeSchema } from "./db/schema.js";
import { createBot } from "./bot.js";

async function main(): Promise<void> {
  console.log("🤖 Starting Telegram GitHub Bot...");

  // Initialize database
  initializeSchema();
  console.log("✅ Database initialized");

  // Create and start bot
  const bot = createBot();

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n🛑 Shutting down...");
    await bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("✅ Bot started! Listening for messages...");
  await bot.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Commit**

```bash
git add src/bot.ts src/index.ts
git commit -m "feat: assemble bot with callback router and entry point

bot.ts registers all middleware, commands, callback query router, and
text message handlers. index.ts initializes DB and starts polling."
```

---

## Task 13: Docker Deployment

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  bot:
    build: .
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - DB_PATH=/app/data/bot.db
      - CODEGEN_DIR=/tmp/codegen
    volumes:
      - ./data:/app/data
      - codegen-tmp:/tmp/codegen
    restart: unless-stopped

volumes:
  codegen-tmp:
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: add Docker and docker-compose for deployment

Multi-stage Node.js 20 Alpine image with git. Docker Compose with
persistent data volume and temp codegen volume."
```

---

## Task 14: Build & Smoke Test

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Build TypeScript**

Run: `npm run build`
Expected: No compilation errors

- [ ] **Step 3: Verify build output**

Run: `ls dist/`
Expected: Compiled JS files matching src/ structure

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify build and tests pass

All unit tests pass, TypeScript compilation succeeds."
```
