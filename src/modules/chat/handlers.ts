import { randomUUID } from "node:crypto";
import type { BotContext } from "../auth/types.js";
import { getDb } from "../../db/client.js";
import { decrypt } from "../auth/crypto.js";
import { config } from "../../config.js";
import { CopilotClient } from "../../utils/copilot-api.js";
import { CHAT_SYSTEM_PROMPT } from "./prompts.js";
import { chunkMessage } from "../../utils/telegram.js";
import type { ChatMessage } from "./types.js";

const MAX_HISTORY = 20;

export async function handleChatStart(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const sessionId = randomUUID();
  ctx.session.chatSessionId = sessionId;

  await ctx.editMessageText(
    "💬 *AI Chat Started*\n\nSend me any message and I'll respond using AI. Topics I can help with:\n\n" +
    "• Code explanations\n• Implementation suggestions\n• Git & GitHub questions\n• General dev advice\n\n" +
    "Send /endchat to end the session.",
    { parse_mode: "Markdown" }
  );
}

export async function handleChatMessage(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.session.chatSessionId) return;

  const userMessage = ctx.message?.text?.trim();
  if (!userMessage) return;

  if (userMessage === "/endchat") {
    ctx.session.chatSessionId = undefined;
    await ctx.reply("✅ Chat session ended. Use the menu to start a new one.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to Menu", callback_data: "menu:main" }],
        ],
      },
    });
    return;
  }

  const db = getDb();
  const sessionId = ctx.session.chatSessionId;

  db.prepare(
    "INSERT INTO chat_messages (id, user_id, session_id, role, content) VALUES (?, ?, ?, 'user', ?)"
  ).run(randomUUID(), ctx.user.id, sessionId, userMessage);

  const history = db
    .prepare(
      "SELECT role, content FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC LIMIT ?"
    )
    .all(ctx.user.id, sessionId, MAX_HISTORY) as ChatMessage[];

  try {
    const token = decrypt(ctx.user.github_token_enc, config.encryptionKey);
    const copilot = new CopilotClient(token);

    const response = await copilot.chatCompletion(
      CHAT_SYSTEM_PROMPT,
      history.map((m) => ({ role: m.role, content: m.content }))
    );

    db.prepare(
      "INSERT INTO chat_messages (id, user_id, session_id, role, content) VALUES (?, ?, ?, 'assistant', ?)"
    ).run(randomUUID(), ctx.user.id, sessionId, response);

    const chunks = chunkMessage(response, 4000);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
  } catch (error: any) {
    await ctx.reply(`❌ AI error: ${error.message}`);
  }
}
