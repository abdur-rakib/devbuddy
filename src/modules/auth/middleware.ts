import type { NextFunction } from "grammy";
import type { BotContext, UserRecord } from "./types.js";
import { getDb } from "../../db/client.js";

const PUBLIC_COMMANDS = ["/start", "/help"];

export async function authMiddleware(
  ctx: BotContext,
  next: NextFunction
): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🔐 [authMiddleware] ▶️ START | telegramId=${telegramId ?? "unknown"}`);

  if (!telegramId) {
    console.log("🔐 [authMiddleware] ⏭️ No telegramId found, skipping");
    return;
  }

  const db = getDb();
  const user = db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as UserRecord | undefined;

  if (user) {
    console.log(`🔐 [authMiddleware] ✅ User found | telegramId=${telegramId}`);
    ctx.user = user;
    console.log("🔐 [authMiddleware] ⏩ Path: authenticated user → next()");
    return next();
  }

  console.log(`🔐 [authMiddleware] 🔍 No user record for telegramId=${telegramId}`);

  const text = ctx.message?.text ?? "";
  if (PUBLIC_COMMANDS.some((cmd) => text.startsWith(cmd))) {
    console.log(`🔐 [authMiddleware] ⏩ Path: public command "${text}" → next()`);
    return next();
  }

  if (ctx.callbackQuery) {
    console.log("🔐 [authMiddleware] ⏩ Path: callback query → next()");
    return next();
  }

  if (ctx.session?.onboardingStep) {
    console.log(`🔐 [authMiddleware] ⏩ Path: onboarding step="${ctx.session.onboardingStep}" → next()`);
    return next();
  }

  console.log(`🔐 [authMiddleware] 🚫 Unauthenticated user, prompting /start | telegramId=${telegramId}`);
  await ctx.reply(
    "👋 Welcome! Please send /start to set up your GitHub account."
  );
  console.log("🔐 [authMiddleware] ⏹️ END");
}
