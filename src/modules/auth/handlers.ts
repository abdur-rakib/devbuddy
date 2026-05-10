import type { BotContext } from "./types.js";
import { encrypt } from "./crypto.js";
import { config } from "../../config.js";
import { getDb } from "../../db/client.js";
import { Octokit } from "@octokit/rest";
import { mainMenuKeyboard } from "../../ui/keyboards.js";

export async function handleStart(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🚀 [handleStart] ▶️ START | telegramId=${telegramId}`);

  if (ctx.user) {
    console.log(`🚀 [handleStart] 👤 Returning user | telegramId=${telegramId}`);
    await ctx.reply("👋 Welcome back! Here's your main menu:", {
      reply_markup: mainMenuKeyboard(),
    });
    console.log("🚀 [handleStart] ⏹️ END (returning user)");
    return;
  }

  console.log(`🚀 [handleStart] 🆕 New user, requesting token | telegramId=${telegramId}`);
  await ctx.reply(
    "👋 Welcome to GitHub Bot!\n\n" +
      "To get started, I need your GitHub Personal Access Token.\n\n" +
      "Required scopes: `repo`, `read:org`\n\n" +
      "Create one at: https://github.com/settings/tokens\n\n" +
      "Send me your token now (I'll encrypt and store it securely):",
    { parse_mode: "Markdown" }
  );
  ctx.session.onboardingStep = "awaiting_token";
  console.log("🚀 [handleStart] ⏹️ END (onboarding started)");
}

export async function handleTokenInput(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🔑 [handleTokenInput] ▶️ START | telegramId=${telegramId}`);

  if (ctx.session.onboardingStep !== "awaiting_token") {
    console.log(`🔑 [handleTokenInput] ⏭️ Not awaiting token, skipping | onboardingStep=${JSON.stringify(ctx.session.onboardingStep)}`);
    return;
  }

  const token = ctx.message?.text?.trim();
  if (!token) {
    console.log(`🔑 [handleTokenInput] ⚠️ Empty token received | telegramId=${telegramId}`);
    await ctx.reply("Please send a valid GitHub token.");
    console.log("🔑 [handleTokenInput] ⏹️ END (no token)");
    return;
  }

  console.log(`🔑 [handleTokenInput] 🗑️ Deleting token message for security | telegramId=${telegramId}`);
  try {
    await ctx.deleteMessage();
    console.log("🔑 [handleTokenInput] ✅ Token message deleted");
  } catch (error) {
    console.log(`🔑 [handleTokenInput] ⚠️ Failed to delete token message: ${JSON.stringify((error as Error).message)}`);
  }

  console.log(`🔑 [handleTokenInput] 🔍 Validating token with GitHub API | telegramId=${telegramId}`);
  const octokit = new Octokit({ auth: token });
  try {
    const { data: githubUser } = await octokit.rest.users.getAuthenticated();
    console.log(`🔑 [handleTokenInput] ✅ GitHub user verified | githubLogin=${githubUser.login}, telegramId=${telegramId}`);

    console.log(`🔑 [handleTokenInput] 🔒 Encrypting token | telegramId=${telegramId}`);
    const encryptedToken = encrypt(token, config.encryptionKey);
    const db = getDb();

    console.log(`🔑 [handleTokenInput] 💾 Upserting user record | telegramId=${telegramId}`);
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
    console.log(`🔑 [handleTokenInput] ✅ User record saved | telegramId=${telegramId}`);

    ctx.user = db
      .prepare("SELECT * FROM users WHERE telegram_id = ?")
      .get(ctx.from!.id) as any;
    console.log(`🔑 [handleTokenInput] 🔄 User reloaded from DB | telegramId=${telegramId}`);

    ctx.session.onboardingStep = undefined;

    await ctx.reply(
      `✅ Connected as *${githubUser.login}*! Here's your main menu:`,
      {
        parse_mode: "Markdown",
        reply_markup: mainMenuKeyboard(),
      }
    );
    console.log(`🔑 [handleTokenInput] ⏹️ END (success, githubLogin=${githubUser.login})`);
  } catch (error) {
    console.log(`🔑 [handleTokenInput] ❌ Token validation failed | telegramId=${telegramId}, error=${JSON.stringify((error as Error).message)}`);
    await ctx.reply(
      "❌ Invalid token. Please check the token and try again.\n\n" +
        "Make sure it has `repo` and `read:org` scopes."
    );
    console.log("🔑 [handleTokenInput] ⏹️ END (invalid token)");
  }
}

export async function handleSettings(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`⚙️ [handleSettings] ▶️ START | telegramId=${telegramId}`);

  if (!ctx.user) {
    console.log(`⚙️ [handleSettings] 🚫 No user found | telegramId=${telegramId}`);
    await ctx.reply("Please /start first.");
    console.log("⚙️ [handleSettings] ⏹️ END (no user)");
    return;
  }

  console.log(`⚙️ [handleSettings] 📋 Showing settings menu | telegramId=${telegramId}`);
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
  console.log("⚙️ [handleSettings] ⏹️ END");
}

export async function handleUpdateToken(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🔄 [handleUpdateToken] ▶️ START | telegramId=${telegramId}`);

  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Send me your new GitHub Personal Access Token.\n" +
      "I'll encrypt and store it securely."
  );
  ctx.session.onboardingStep = "awaiting_token";
  console.log(`🔄 [handleUpdateToken] ⏹️ END | onboardingStep=awaiting_token, telegramId=${telegramId}`);
}
