import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";

describe("Database Schema", () => {
  it("creates all required tables in an in-memory database", () => {
    const db = new Database(":memory:");

    // Run the schema SQL
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        telegram_id INTEGER UNIQUE NOT NULL,
        telegram_username TEXT,
        github_token_enc BLOB NOT NULL,
        copilot_token_enc BLOB NOT NULL,
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
        id TEXT PRIMARY KEY,
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

    // Verify all tables exist
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      ["chat_messages", "codegen_jobs", "repos", "users"].sort()
    );

    db.close();
  });

  it("verifies users table has expected columns", () => {
    const db = new Database(":memory:");

    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        telegram_id INTEGER UNIQUE NOT NULL,
        telegram_username TEXT,
        github_token_enc BLOB NOT NULL,
        copilot_token_enc BLOB NOT NULL,
        active_repo_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get table info
    const columns = db
      .prepare(`PRAGMA table_info(users)`)
      .all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("telegram_id");
    expect(columnNames).toContain("telegram_username");
    expect(columnNames).toContain("github_token_enc");
    expect(columnNames).toContain("copilot_token_enc");
    expect(columnNames).toContain("active_repo_id");
    expect(columnNames).toContain("created_at");

    // Verify constraints
    expect(columns.find((c) => c.name === "github_token_enc")?.notnull).toBe(1);
    expect(columns.find((c) => c.name === "copilot_token_enc")?.notnull).toBe(1);
    expect(columns.find((c) => c.name === "telegram_id")?.notnull).toBe(1);

    db.close();
  });

  it("verifies repos table has expected columns", () => {
    const db = new Database(":memory:");

    db.exec(`
      CREATE TABLE IF NOT EXISTS repos (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        github_repo_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        default_branch TEXT,
        last_synced DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    const columns = db
      .prepare(`PRAGMA table_info(repos)`)
      .all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("user_id");
    expect(columnNames).toContain("github_repo_id");
    expect(columnNames).toContain("full_name");
    expect(columnNames).toContain("default_branch");
    expect(columnNames).toContain("last_synced");

    db.close();
  });

  it("verifies chat_messages table has expected columns", () => {
    const db = new Database(":memory:");

    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    const columns = db
      .prepare(`PRAGMA table_info(chat_messages)`)
      .all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("user_id");
    expect(columnNames).toContain("session_id");
    expect(columnNames).toContain("role");
    expect(columnNames).toContain("content");
    expect(columnNames).toContain("created_at");

    db.close();
  });

  it("verifies codegen_jobs table has expected columns", () => {
    const db = new Database(":memory:");

    db.exec(`
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

    const columns = db
      .prepare(`PRAGMA table_info(codegen_jobs)`)
      .all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("user_id");
    expect(columnNames).toContain("repo_id");
    expect(columnNames).toContain("description");
    expect(columnNames).toContain("status");
    expect(columnNames).toContain("branch_name");
    expect(columnNames).toContain("pr_url");
    expect(columnNames).toContain("workspace_path");
    expect(columnNames).toContain("created_at");

    db.close();
  });

  it("schema is idempotent (running twice doesn't error)", () => {
    const db = new Database(":memory:");

    const sqlSchema = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        telegram_id INTEGER UNIQUE NOT NULL,
        telegram_username TEXT,
        github_token_enc BLOB NOT NULL,
        copilot_token_enc BLOB NOT NULL,
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
        id TEXT PRIMARY KEY,
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
    `;

    // Run schema twice - should not throw
    expect(() => {
      db.exec(sqlSchema);
      db.exec(sqlSchema);
    }).not.toThrow();

    db.close();
  });

  it("supports foreign key constraints", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        telegram_id INTEGER UNIQUE NOT NULL,
        telegram_username TEXT,
        github_token_enc BLOB NOT NULL,
        copilot_token_enc BLOB NOT NULL,
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
    `);

    // Insert a user
    const insertUser = db.prepare(
      `INSERT INTO users (telegram_id, github_token_enc, copilot_token_enc) VALUES (?, ?, ?)`
    );
    insertUser.run(123456, Buffer.from("encrypted_github"), Buffer.from("encrypted_copilot"));

    // Insert a repo with valid foreign key
    const insertRepo = db.prepare(
      `INSERT INTO repos (user_id, github_repo_id, full_name) VALUES (?, ?, ?)`
    );
    const result = insertRepo.run(1, 789, "owner/repo");
    expect(result.changes).toBe(1);

    // Try to insert a repo with invalid user_id - should fail with foreign keys on
    expect(() => {
      insertRepo.run(999, 789, "owner/repo");
    }).toThrow();

    db.close();
  });
});
