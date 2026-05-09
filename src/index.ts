import { config } from "./config.js";
import { initializeSchema } from "./db/schema.js";
import { createBot } from "./bot.js";

async function main(): Promise<void> {
  console.log("🤖 Starting Telegram GitHub Bot...");

  initializeSchema();
  console.log("✅ Database initialized");

  const bot = createBot();

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
