import type { BotContext } from "../modules/auth/types.js";
import { mainMenuKeyboard } from "./keyboards.js";

export async function showMainMenu(ctx: BotContext): Promise<void> {
  const text = "🏠 *Main Menu*\n\nWhat would you like to do?";

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(),
    });
  }
}

export async function showHelp(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "❓ *Help*\n\n" +
      "📂 *Repos* — Browse your GitHub repositories\n" +
      "🔀 *PRs* — View and manage pull requests\n" +
      "🐛 *Issues* — Browse repository issues\n" +
      "🤖 *New Feature* — AI generates code and creates a PR\n" +
      "💬 *AI Chat* — Chat with AI about anything\n" +
      "⚙️ *Settings* — Update your GitHub token\n\n" +
      "Use /start to reset your session.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to Menu", callback_data: "menu:main" }],
        ],
      },
    }
  );
}
