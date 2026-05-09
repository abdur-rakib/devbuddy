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
