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
