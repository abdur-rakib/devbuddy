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
  console.log(`💬 [handleChatStart] START — telegramId=${ctx.from?.id}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("💬 [handleChatStart] No user found, exiting early");
    return;
  }

  const sessionId = randomUUID();
  ctx.session.chatSessionId = sessionId;
  console.log(`💬 [handleChatStart] Session created — sessionId=${sessionId}`);

  await ctx.editMessageText(
    "💬 *AI Chat Started*\n\nSend me any message and I'll respond using AI. Topics I can help with:\n\n" +
    "• Code explanations\n• Implementation suggestions\n• Git & GitHub questions\n• General dev advice\n\n" +
    "Send /endchat to end the session.",
    { parse_mode: "Markdown" }
  );
  console.log("💬 [handleChatStart] END");
}

export async function handleChatMessage(ctx: BotContext): Promise<void> {
  console.log(`💬 [handleChatMessage] START — telegramId=${ctx.from?.id}, sessionId=${ctx.session.chatSessionId}`);
  if (!ctx.user || !ctx.session.chatSessionId) {
    console.log("💬 [handleChatMessage] No user or session, exiting early");
    return;
  }

  const userMessage = ctx.message?.text?.trim();
  if (!userMessage) {
    console.log("💬 [handleChatMessage] Empty message, exiting early");
    return;
  }

  if (userMessage === "/endchat") {
    console.log(`💬 [handleChatMessage] /endchat received — ending sessionId=${ctx.session.chatSessionId}`);
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

  console.log(`💬 [handleChatMessage] Message received — length=${userMessage.length}`);

  const db = getDb();
  const sessionId = ctx.session.chatSessionId;

  db.prepare(
    "INSERT INTO chat_messages (id, user_id, session_id, role, content) VALUES (?, ?, ?, 'user', ?)"
  ).run(randomUUID(), ctx.user.id, sessionId, userMessage);
  console.log("💬 [handleChatMessage] User message stored in DB");

  const history = db
    .prepare(
      "SELECT role, content FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC LIMIT ?"
    )
    .all(ctx.user.id, sessionId, MAX_HISTORY) as ChatMessage[];
  console.log(`💬 [handleChatMessage] History loaded — count=${history.length}`);

  try {
    const token = decrypt(ctx.user.github_token_enc, config.encryptionKey);
    const copilot = new CopilotClient(token);

    console.log("🤖 [handleChatMessage] Starting AI chat call");
    const response = await copilot.chatCompletion(
      CHAT_SYSTEM_PROMPT,
      history.map((m) => ({ role: m.role, content: m.content }))
    );
    console.log(`🤖 [handleChatMessage] AI chat call complete — responseLength=${response.length}`);

    db.prepare(
      "INSERT INTO chat_messages (id, user_id, session_id, role, content) VALUES (?, ?, ?, 'assistant', ?)"
    ).run(randomUUID(), ctx.user.id, sessionId, response);
    console.log("💬 [handleChatMessage] Assistant response stored in DB");

    const chunks = chunkMessage(response, 4000);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
    console.log(`💬 [handleChatMessage] END — sent ${chunks.length} chunk(s)`);
  } catch (error: any) {
    console.error(`❌ [handleChatMessage] Error — ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    await ctx.reply(`❌ AI error: ${error.message}`);
  }
}
