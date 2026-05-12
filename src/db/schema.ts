import { getDb } from "./client.js";

export function initializeSchema(): void {
  const db = getDb();

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
}
