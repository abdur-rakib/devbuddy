import type { BotContext } from "../auth/types.js";
import type { InlineKeyboardButton } from "grammy/types";
import { getDb } from "../../db/client.js";
import { createOctokit, listUserRepos, listIssues, listPullRequests, listBranches, getPullRequest, getPrDiff } from "./client.js";
import { formatRepoList, formatIssueList, formatPrList, formatPrSummary, formatBranchList } from "./formatters.js";
import { paginate } from "../../ui/pagination.js";
import { paginationRow, repoMenuKeyboard, prDetailKeyboard } from "../../ui/keyboards.js";
import { chunkMessage } from "../../utils/telegram.js";

export async function handleRepoList(ctx: BotContext, page: number = 1): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const octokit = createOctokit(ctx.user);
  const repos = await listUserRepos(octokit);

  // Cache repos in DB
  const db = getDb();

  db.prepare("DELETE FROM repos WHERE user_id = ?").run(ctx.user.id);

  const insert = db.prepare(
    `INSERT INTO repos (user_id, github_repo_id, full_name, default_branch, last_synced)
     VALUES (?, 0, ?, NULL, datetime('now'))`
  );

  for (const repo of repos) {
    insert.run(ctx.user.id, repo.full_name);
  }

  // Reload from DB to get IDs
  const dbRepos = db
    .prepare("SELECT id, full_name FROM repos WHERE user_id = ? ORDER BY last_synced DESC")
    .all(ctx.user.id) as Array<{ id: number; full_name: string }>;

  const paginated = paginate(dbRepos, page, 8);

  const buttons: InlineKeyboardButton[][] = paginated.items.map((r) => [
    { text: `📂 ${r.full_name}`, callback_data: `repo:${r.id}:select` },
  ]);

  const navRow = paginationRow("repos", paginated.page, paginated.hasNext, paginated.hasPrev);
  buttons.push(navRow);
  buttons.push([{ text: "◀️ Back to Menu", callback_data: "menu:main" }]);

  const text = `📂 *Your Repositories* (${paginated.page}/${paginated.totalPages})`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  }
}

export async function handleRepoSelect(ctx: BotContext, repoId: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?").get(repoId, ctx.user.id) as any;
  if (!repo) {
    await ctx.editMessageText("Repo not found.");
    return;
  }

  // Set as active repo
  db.prepare("UPDATE users SET active_repo_id = ? WHERE id = ?").run(repoId, ctx.user.id);
  ctx.user.active_repo_id = repoId;

  await ctx.editMessageText(`📂 *${repo.full_name}*\n\nWhat would you like to do?`, {
    parse_mode: "Markdown",
    reply_markup: repoMenuKeyboard(repoId),
  });
}

function getActiveRepo(ctx: BotContext, repoId: number): { owner: string; repo: string; full_name: string } | null {
  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?").get(repoId, ctx.user!.id) as any;
  if (!repo) return null;
  const [owner, repoName] = repo.full_name.split("/");
  return { owner, repo: repoName, full_name: repo.full_name };
}

export async function handleIssueList(ctx: BotContext, repoId: number, page: number = 1): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  const issues = await listIssues(octokit, repoInfo.owner, repoInfo.repo);
  const formatted = formatIssueList(issues);

  await ctx.editMessageText(
    `🐛 *Issues — ${repoInfo.full_name}*\n\n${formatted}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back", callback_data: `repo:${repoId}:select` }],
        ],
      },
    }
  );
}

export async function handlePrList(ctx: BotContext, repoId: number, page: number = 1): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  const prs = await listPullRequests(octokit, repoInfo.owner, repoInfo.repo);

  const buttons: InlineKeyboardButton[][] = prs.map((pr) => [
    { text: `#${pr.number} ${pr.title}`, callback_data: `pr:${repoId}:${pr.number}:detail` },
  ]);
  buttons.push([{ text: "◀️ Back", callback_data: `repo:${repoId}:select` }]);

  await ctx.editMessageText(`🔀 *Pull Requests — ${repoInfo.full_name}*`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

export async function handlePrDetail(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  const pr = await getPullRequest(octokit, repoInfo.owner, repoInfo.repo, prNumber);
  const text = formatPrSummary(pr);

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: prDetailKeyboard(repoId, prNumber),
  });
}

export async function handlePrDiff(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  const diff = await getPrDiff(octokit, repoInfo.owner, repoInfo.repo, prNumber);

  const chunks = chunkMessage(`\`\`\`diff\n${diff}\n\`\`\``, 4000);
  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: "Markdown" });
  }
}

export async function handleBranchList(ctx: BotContext, repoId: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  const branches = await listBranches(octokit, repoInfo.owner, repoInfo.repo);
  const formatted = formatBranchList(branches);

  await ctx.editMessageText(
    `🌿 *Branches — ${repoInfo.full_name}*\n\n${formatted}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back", callback_data: `repo:${repoId}:select` }],
        ],
      },
    }
  );
}

export async function handlePrApprove(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  await octokit.rest.pulls.createReview({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    pull_number: prNumber,
    event: "APPROVE",
  });

  await ctx.editMessageText(`✅ PR #${prNumber} approved!`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
      ],
    },
  });
}

export async function handlePrMerge(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  await ctx.answerCallbackQuery();

  await ctx.editMessageText(`🔀 Choose merge method for PR #${prNumber}:`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Merge Commit", callback_data: `pr:${repoId}:${prNumber}:merge:merge` },
          { text: "Squash", callback_data: `pr:${repoId}:${prNumber}:merge:squash` },
          { text: "Rebase", callback_data: `pr:${repoId}:${prNumber}:merge:rebase` },
        ],
        [{ text: "◀️ Cancel", callback_data: `pr:${repoId}:${prNumber}:detail` }],
      ],
    },
  });
}

export async function handlePrMergeConfirm(
  ctx: BotContext,
  repoId: number,
  prNumber: number,
  method: "merge" | "squash" | "rebase"
): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  const octokit = createOctokit(ctx.user);
  try {
    await octokit.rest.pulls.merge({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      pull_number: prNumber,
      merge_method: method,
    });
    await ctx.editMessageText(`✅ PR #${prNumber} merged via ${method}!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to PRs", callback_data: `repo:${repoId}:prs` }],
        ],
      },
    });
  } catch (error: any) {
    await ctx.editMessageText(`❌ Failed to merge: ${error.message}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
        ],
      },
    });
  }
}
