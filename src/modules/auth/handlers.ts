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

  console.log(`🚀 [handleStart] 🆕 New user, requesting GitHub token | telegramId=${telegramId}`);
  await ctx.reply(
    "👋 Welcome to DevBuddy!\n\n" +
      "I need two tokens to get started:\n\n" +
      "*Step 1 of 2 — GitHub Personal Access Token*\n\n" +
      "This token is used for repository access (repos, PRs, issues).\n" +
      "Required scopes: `repo`, `read:org`\n\n" +
      "Create one at: https://github.com/settings/tokens\n\n" +
      "Send me your GitHub token now:",
    { parse_mode: "Markdown" }
  );
  ctx.session.onboardingStep = "awaiting_token";
  console.log("🚀 [handleStart] ⏹️ END (onboarding step 1 started)");
}

export async function handleTokenInput(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  const step = ctx.session.onboardingStep;
  console.log(`🔑 [handleTokenInput] ▶️ START | telegramId=${telegramId}, step=${step}`);

  if (step !== "awaiting_token" && step !== "awaiting_copilot_token") {
    console.log(`🔑 [handleTokenInput] ⏭️ Not awaiting any token, skipping`);
    return;
  }

  const token = ctx.message?.text?.trim();
  if (!token) {
    console.log(`🔑 [handleTokenInput] ⚠️ Empty token received | telegramId=${telegramId}`);
    await ctx.reply("Please send a valid token.");
    console.log("🔑 [handleTokenInput] ⏹️ END (no token)");
    return;
  }

  // Delete message containing the token for security
  console.log(`🔑 [handleTokenInput] 🗑️ Deleting token message for security | telegramId=${telegramId}`);
  try {
    await ctx.deleteMessage();
    console.log("🔑 [handleTokenInput] ✅ Token message deleted");
  } catch (error) {
    console.log(`🔑 [handleTokenInput] ⚠️ Failed to delete token message: ${JSON.stringify((error as Error).message)}`);
  }

  if (step === "awaiting_token") {
    await handleGitHubTokenInput(ctx, token, telegramId);
  } else {
    await handleCopilotTokenInput(ctx, token, telegramId);
  }
}

async function handleGitHubTokenInput(ctx: BotContext, token: string, telegramId: number | undefined): Promise<void> {
  console.log(`🔑 [handleGitHubTokenInput] 🔍 Validating GitHub token | telegramId=${telegramId}`);

  const octokit = new Octokit({ auth: token });
  try {
    const { data: githubUser } = await octokit.rest.users.getAuthenticated();
    console.log(`🔑 [handleGitHubTokenInput] ✅ GitHub user verified | githubLogin=${githubUser.login}, telegramId=${telegramId}`);

    console.log(`🔑 [handleGitHubTokenInput] 🔒 Encrypting GitHub token | telegramId=${telegramId}`);
    const encryptedToken = encrypt(token, config.encryptionKey);
    const db = getDb();

    console.log(`🔑 [handleGitHubTokenInput] 💾 Upserting user record | telegramId=${telegramId}`);
    db.prepare(
      `INSERT INTO users (telegram_id, telegram_username, github_token_enc, copilot_token_enc)
       VALUES (?, ?, ?, '')
       ON CONFLICT(telegram_id) DO UPDATE SET
         github_token_enc = excluded.github_token_enc,
         telegram_username = excluded.telegram_username`
    ).run(
      ctx.from!.id,
      ctx.from!.username ?? null,
      encryptedToken
    );
    console.log(`🔑 [handleGitHubTokenInput] ✅ GitHub token saved | telegramId=${telegramId}`);

    // Move to step 2 — Copilot token
    ctx.session.onboardingStep = "awaiting_copilot_token";

    await ctx.reply(
      `✅ GitHub connected as *${githubUser.login}*!\n\n` +
        "*Step 2 of 2 — Copilot API Token*\n\n" +
        "This token is used for AI features (chat, PR review, code generation).\n" +
        "It needs access to GitHub Copilot / Models API.\n\n" +
        "You can use the same token if it has Copilot access, or provide a separate one.\n\n" +
        "Send me your Copilot API token now:",
      { parse_mode: "Markdown" }
    );
    console.log(`🔑 [handleGitHubTokenInput] ⏹️ END (step 2 started) | telegramId=${telegramId}`);
  } catch (error) {
    console.log(`🔑 [handleGitHubTokenInput] ❌ GitHub token validation failed | telegramId=${telegramId}, error=${JSON.stringify((error as Error).message)}`);
    await ctx.reply(
      "❌ Invalid GitHub token. Please check the token and try again.\n\n" +
        "Make sure it has `repo` and `read:org` scopes."
    );
    console.log("🔑 [handleGitHubTokenInput] ⏹️ END (invalid token)");
  }
}

async function handleCopilotTokenInput(ctx: BotContext, token: string, telegramId: number | undefined): Promise<void> {
  console.log(`🤖 [handleCopilotTokenInput] 🔍 Validating Copilot token | telegramId=${telegramId}`);

  // Validate by making a lightweight call to the Copilot API
  try {
    const response = await fetch(`${config.copilotApiUrl}/models`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Copilot API returned ${response.status}`);
    }
    console.log(`🤖 [handleCopilotTokenInput] ✅ Copilot token validated | telegramId=${telegramId}`);

    console.log(`🤖 [handleCopilotTokenInput] 🔒 Encrypting Copilot token | telegramId=${telegramId}`);
    const encryptedToken = encrypt(token, config.encryptionKey);
    const db = getDb();

    console.log(`🤖 [handleCopilotTokenInput] 💾 Saving Copilot token | telegramId=${telegramId}`);
    db.prepare(
      "UPDATE users SET copilot_token_enc = ? WHERE telegram_id = ?"
    ).run(encryptedToken, ctx.from!.id);
    console.log(`🤖 [handleCopilotTokenInput] ✅ Copilot token saved | telegramId=${telegramId}`);

    // Reload user and finish onboarding
    ctx.user = db
      .prepare("SELECT * FROM users WHERE telegram_id = ?")
      .get(ctx.from!.id) as any;
    console.log(`🤖 [handleCopilotTokenInput] 🔄 User reloaded from DB | telegramId=${telegramId}`);

    ctx.session.onboardingStep = undefined;

    await ctx.reply(
      "✅ *Setup complete!* Both tokens are saved securely.\n\nHere's your main menu:",
      {
        parse_mode: "Markdown",
        reply_markup: mainMenuKeyboard(),
      }
    );
    console.log(`🤖 [handleCopilotTokenInput] ⏹️ END (success) | telegramId=${telegramId}`);
  } catch (error) {
    console.log(`🤖 [handleCopilotTokenInput] ❌ Copilot token validation failed | telegramId=${telegramId}, error=${JSON.stringify((error as Error).message)}`);
    await ctx.reply(
      "❌ Invalid Copilot API token. Please check the token and try again.\n\n" +
        "Make sure your GitHub account has Copilot access."
    );
    console.log("🤖 [handleCopilotTokenInput] ⏹️ END (invalid token)");
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
    "⚙️ *Settings*\n\nUpdate your tokens or manage preferences.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔑 Update GitHub Token", callback_data: "settings:update_github_token" }],
          [{ text: "🤖 Update Copilot Token", callback_data: "settings:update_copilot_token" }],
          [{ text: "◀️ Back to Menu", callback_data: "menu:main" }],
        ],
      },
    }
  );
  console.log("⚙️ [handleSettings] ⏹️ END");
}

export async function handleUpdateGitHubToken(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🔄 [handleUpdateGitHubToken] ▶️ START | telegramId=${telegramId}`);

  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Send me your new *GitHub Personal Access Token*.\n" +
      "I'll encrypt and store it securely.",
    { parse_mode: "Markdown" }
  );
  ctx.session.onboardingStep = "awaiting_token";
  console.log(`🔄 [handleUpdateGitHubToken] ⏹️ END | telegramId=${telegramId}`);
}

export async function handleUpdateCopilotToken(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🔄 [handleUpdateCopilotToken] ▶️ START | telegramId=${telegramId}`);

  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Send me your new *Copilot API Token*.\n" +
      "I'll encrypt and store it securely.",
    { parse_mode: "Markdown" }
  );
  ctx.session.onboardingStep = "awaiting_copilot_token";
  console.log(`🔄 [handleUpdateCopilotToken] ⏹️ END | telegramId=${telegramId}`);
}
