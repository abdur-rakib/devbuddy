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
