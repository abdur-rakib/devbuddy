import type { BotContext } from "../auth/types.js";
import { createOctokit, getPrDiff, getPullRequest } from "../github/client.js";
import { getDb } from "../../db/client.js";
import { decrypt } from "../auth/crypto.js";
import { config } from "../../config.js";
import { CopilotClient } from "../../utils/copilot-api.js";
import type { ReviewResult } from "./types.js";
import { PR_REVIEW_SYSTEM_PROMPT } from "./prompts.js";

export async function handlePrReview(
  ctx: BotContext,
  repoId: number,
  prNumber: number
): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?").get(repoId, ctx.user.id) as any;
  if (!repo) return;

  const [owner, repoName] = repo.full_name.split("/");
  const octokit = createOctokit(ctx.user);

  await ctx.editMessageText("🤖 Analyzing PR... This may take a moment.");

  try {
    const [pr, diff] = await Promise.all([
      getPullRequest(octokit, owner, repoName, prNumber),
      getPrDiff(octokit, owner, repoName, prNumber),
    ]);

    const token = decrypt(ctx.user.github_token_enc, config.encryptionKey);
    const copilot = new CopilotClient(token);

    const userMessage = `Review this pull request:\n\nTitle: ${pr.title}\nBranch: ${pr.head} → ${pr.base}\n\nDiff:\n${diff}`;

    const response = await copilot.chatCompletion(PR_REVIEW_SYSTEM_PROMPT, [
      { role: "user", content: userMessage },
    ]);

    let review: ReviewResult;
    try {
      review = JSON.parse(response);
    } catch {
      // If AI didn't return valid JSON, show raw response
      await ctx.editMessageText(`🤖 *AI Review*\n\n${response}`, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
          ],
        },
      });
      return;
    }

    const severityEmoji = { critical: "🔴", warning: "🟡", suggestion: "💡" };

    let text = `🤖 *AI Review — PR #${prNumber}*\n\n`;
    text += `📝 ${review.summary}\n\n`;

    if (review.issues.length === 0) {
      text += "✅ No issues found!\n";
    } else {
      for (const issue of review.issues) {
        const emoji = severityEmoji[issue.severity] ?? "❓";
        const line = issue.line ? `:${issue.line}` : "";
        text += `${emoji} *${issue.file}${line}*\n${issue.description}\n\n`;
      }
    }

    text += review.approved ? "\n✅ *Recommendation: Approve*" : "\n⚠️ *Recommendation: Request Changes*";

    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve PR", callback_data: `pr:${repoId}:${prNumber}:approve` },
          ],
          [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
        ],
      },
    });
  } catch (error: any) {
    await ctx.editMessageText(`❌ Review failed: ${error.message}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
        ],
      },
    });
  }
}
