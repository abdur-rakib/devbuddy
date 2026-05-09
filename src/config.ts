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
