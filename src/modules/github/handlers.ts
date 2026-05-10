import type { BotContext } from "../auth/types.js";
import type { InlineKeyboardButton } from "grammy/types";
import { getDb } from "../../db/client.js";
import { createOctokit, listUserRepos, listIssues, listPullRequests, listBranches, getPullRequest, getPrDiff } from "./client.js";
import { formatRepoList, formatIssueList, formatPrList, formatPrSummary, formatBranchList } from "./formatters.js";
import { paginate } from "../../ui/pagination.js";
import { paginationRow, repoMenuKeyboard, prDetailKeyboard } from "../../ui/keyboards.js";
import { chunkMessage } from "../../utils/telegram.js";

export async function handleRepoList(ctx: BotContext, page: number = 1): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`📂 [handleRepoList] ▶️ START | telegramId=${telegramId}, page=${page}`);
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("📂 [handleRepoList] 🚫 No user, aborting");
    return;
  }

  console.log(`📂 [handleRepoList] 🔍 Fetching repos from GitHub API | telegramId=${telegramId}`);
  const octokit = createOctokit(ctx.user);
  const repos = await listUserRepos(octokit);
  console.log(`📂 [handleRepoList] ✅ GitHub API returned ${repos.length} repos`);

  const db = getDb();

  console.log(`📂 [handleRepoList] 🗑️ Clearing cached repos | userId=${ctx.user.id}`);
  db.prepare("DELETE FROM repos WHERE user_id = ?").run(ctx.user.id);

  const insert = db.prepare(
    `INSERT INTO repos (user_id, github_repo_id, full_name, default_branch, last_synced)
     VALUES (?, 0, ?, ?, datetime('now'))`
  );

  for (const repo of repos) {
    insert.run(ctx.user.id, repo.full_name, repo.default_branch);
  }
  console.log(`📂 [handleRepoList] 💾 Cached ${repos.length} repos in DB`);

  const dbRepos = db
    .prepare("SELECT id, full_name FROM repos WHERE user_id = ? ORDER BY last_synced DESC")
    .all(ctx.user.id) as Array<{ id: number; full_name: string }>;

  const paginated = paginate(dbRepos, page, 8);
  console.log(`📂 [handleRepoList] 📄 Pagination: page=${paginated.page}/${paginated.totalPages}, items=${paginated.items.length}`);

  const buttons: InlineKeyboardButton[][] = paginated.items.map((r) => [
    { text: `📂 ${r.full_name}`, callback_data: `repo:${r.id}:select` },
  ]);

  const navRow = paginationRow("repos", paginated.page, paginated.hasNext, paginated.hasPrev);
  buttons.push(navRow);
  buttons.push([{ text: "◀️ Back to Menu", callback_data: "menu:main" }]);

  const text = `📂 *Your Repositories* (${paginated.page}/${paginated.totalPages})`;

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (error: any) {
      if (!error.description?.includes("message is not modified")) {
        console.log(`📂 [handleRepoList] ❌ Edit message failed: ${JSON.stringify(error.message)}`);
        throw error;
      }
      console.log("📂 [handleRepoList] ⏭️ Message not modified, skipping");
    }
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  }
  console.log("📂 [handleRepoList] ⏹️ END");
}

export async function handleRepoSelect(ctx: BotContext, repoId: number): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`📂 [handleRepoSelect] ▶️ START | telegramId=${telegramId}, repoId=${repoId}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("📂 [handleRepoSelect] 🚫 No user, aborting");
    return;
  }

  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?").get(repoId, ctx.user.id) as any;
  if (!repo) {
    console.log(`📂 [handleRepoSelect] ❌ Repo not found | repoId=${repoId}, userId=${ctx.user.id}`);
    await ctx.editMessageText("Repo not found.");
    return;
  }

  console.log(`📂 [handleRepoSelect] ✅ Repo found: ${repo.full_name}`);
  db.prepare("UPDATE users SET active_repo_id = ? WHERE id = ?").run(repoId, ctx.user.id);
  ctx.user.active_repo_id = repoId;
  console.log(`📂 [handleRepoSelect] 💾 Active repo set | repoId=${repoId}`);

  await ctx.editMessageText(`📂 *${repo.full_name}*\n\nWhat would you like to do?`, {
    parse_mode: "Markdown",
    reply_markup: repoMenuKeyboard(repoId),
  });
  console.log("📂 [handleRepoSelect] ⏹️ END");
}

function getActiveRepo(ctx: BotContext, repoId: number): { owner: string; repo: string; full_name: string } | null {
  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?").get(repoId, ctx.user!.id) as any;
  if (!repo) {
    console.log(`🔍 [getActiveRepo] ❌ Repo not found | repoId=${repoId}, userId=${ctx.user!.id}`);
    return null;
  }
  const [owner, repoName] = repo.full_name.split("/");
  console.log(`🔍 [getActiveRepo] ✅ Resolved repo | owner=${owner}, repo=${repoName}`);
  return { owner, repo: repoName, full_name: repo.full_name };
}

export async function handleIssueList(ctx: BotContext, repoId: number, page: number = 1): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🐛 [handleIssueList] ▶️ START | telegramId=${telegramId}, repoId=${repoId}, page=${page}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("🐛 [handleIssueList] 🚫 No user, aborting");
    return;
  }

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  console.log(`🐛 [handleIssueList] 🔍 Fetching issues | repo=${repoInfo.full_name}`);
  const octokit = createOctokit(ctx.user);
  const issues = await listIssues(octokit, repoInfo.owner, repoInfo.repo);
  console.log(`🐛 [handleIssueList] ✅ Fetched ${issues.length} issues`);
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
  console.log("🐛 [handleIssueList] ⏹️ END");
}

export async function handlePrList(ctx: BotContext, repoId: number, page: number = 1): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🔀 [handlePrList] ▶️ START | telegramId=${telegramId}, repoId=${repoId}, page=${page}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("🔀 [handlePrList] 🚫 No user, aborting");
    return;
  }

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  console.log(`🔀 [handlePrList] 🔍 Fetching PRs | repo=${repoInfo.full_name}`);
  const octokit = createOctokit(ctx.user);
  const prs = await listPullRequests(octokit, repoInfo.owner, repoInfo.repo);
  console.log(`🔀 [handlePrList] ✅ Fetched ${prs.length} PRs`);

  const buttons: InlineKeyboardButton[][] = prs.map((pr) => [
    { text: `#${pr.number} ${pr.title}`, callback_data: `pr:${repoId}:${pr.number}:detail` },
  ]);
  buttons.push([{ text: "◀️ Back", callback_data: `repo:${repoId}:select` }]);

  await ctx.editMessageText(`🔀 *Pull Requests — ${repoInfo.full_name}*`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
  console.log("🔀 [handlePrList] ⏹️ END");
}

export async function handlePrDetail(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`📋 [handlePrDetail] ▶️ START | telegramId=${telegramId}, repoId=${repoId}, prNumber=${prNumber}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("📋 [handlePrDetail] 🚫 No user, aborting");
    return;
  }

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  console.log(`📋 [handlePrDetail] 🔍 Fetching PR #${prNumber} | repo=${repoInfo.full_name}`);
  const octokit = createOctokit(ctx.user);
  const pr = await getPullRequest(octokit, repoInfo.owner, repoInfo.repo, prNumber);
  console.log(`📋 [handlePrDetail] ✅ PR fetched | title=${JSON.stringify(pr.title)}, state=${pr.state}`);
  const text = formatPrSummary(pr);

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: prDetailKeyboard(repoId, prNumber),
  });
  console.log("📋 [handlePrDetail] ⏹️ END");
}

export async function handlePrDiff(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`📝 [handlePrDiff] ▶️ START | telegramId=${telegramId}, repoId=${repoId}, prNumber=${prNumber}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("📝 [handlePrDiff] 🚫 No user, aborting");
    return;
  }

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  console.log(`📝 [handlePrDiff] 🔍 Fetching diff for PR #${prNumber} | repo=${repoInfo.full_name}`);
  const octokit = createOctokit(ctx.user);
  const diff = await getPrDiff(octokit, repoInfo.owner, repoInfo.repo, prNumber);
  console.log(`📝 [handlePrDiff] ✅ Diff fetched | length=${diff.length} chars`);

  const chunks = chunkMessage(`\`\`\`diff\n${diff}\n\`\`\``, 4000);
  console.log(`📝 [handlePrDiff] 📤 Sending ${chunks.length} message chunks`);
  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: "Markdown" });
  }
  console.log("📝 [handlePrDiff] ⏹️ END");
}

export async function handleBranchList(ctx: BotContext, repoId: number): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🌿 [handleBranchList] ▶️ START | telegramId=${telegramId}, repoId=${repoId}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("🌿 [handleBranchList] 🚫 No user, aborting");
    return;
  }

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  console.log(`🌿 [handleBranchList] 🔍 Fetching branches | repo=${repoInfo.full_name}`);
  const octokit = createOctokit(ctx.user);
  const branches = await listBranches(octokit, repoInfo.owner, repoInfo.repo);
  console.log(`🌿 [handleBranchList] ✅ Fetched ${branches.length} branches`);
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
  console.log("🌿 [handleBranchList] ⏹️ END");
}

export async function handlePrApprove(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`✅ [handlePrApprove] ▶️ START | telegramId=${telegramId}, repoId=${repoId}, prNumber=${prNumber}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("✅ [handlePrApprove] 🚫 No user, aborting");
    return;
  }

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  console.log(`✅ [handlePrApprove] 🔍 Submitting approval for PR #${prNumber} | repo=${repoInfo.full_name}`);
  const octokit = createOctokit(ctx.user);
  await octokit.rest.pulls.createReview({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    pull_number: prNumber,
    event: "APPROVE",
  });
  console.log(`✅ [handlePrApprove] ✅ PR #${prNumber} approved`);

  await ctx.editMessageText(`✅ PR #${prNumber} approved!`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
      ],
    },
  });
  console.log("✅ [handlePrApprove] ⏹️ END");
}

export async function handlePrMerge(ctx: BotContext, repoId: number, prNumber: number): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🔀 [handlePrMerge] ▶️ START | telegramId=${telegramId}, repoId=${repoId}, prNumber=${prNumber}`);
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
  console.log("🔀 [handlePrMerge] ⏹️ END");
}

export async function handlePrMergeConfirm(
  ctx: BotContext,
  repoId: number,
  prNumber: number,
  method: "merge" | "squash" | "rebase"
): Promise<void> {
  const telegramId = ctx.from?.id;
  console.log(`🔀 [handlePrMergeConfirm] ▶️ START | telegramId=${telegramId}, repoId=${repoId}, prNumber=${prNumber}, method=${method}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("🔀 [handlePrMergeConfirm] 🚫 No user, aborting");
    return;
  }

  const repoInfo = getActiveRepo(ctx, repoId);
  if (!repoInfo) return;

  console.log(`🔀 [handlePrMergeConfirm] 🔍 Merging PR #${prNumber} via ${method} | repo=${repoInfo.full_name}`);
  const octokit = createOctokit(ctx.user);
  try {
    await octokit.rest.pulls.merge({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      pull_number: prNumber,
      merge_method: method,
    });
    console.log(`🔀 [handlePrMergeConfirm] ✅ PR #${prNumber} merged via ${method}`);
    await ctx.editMessageText(`✅ PR #${prNumber} merged via ${method}!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to PRs", callback_data: `repo:${repoId}:prs` }],
        ],
      },
    });
  } catch (error: any) {
    console.log(`🔀 [handlePrMergeConfirm] ❌ Merge failed | prNumber=${prNumber}, method=${method}, error=${JSON.stringify(error.message)}`);
    await ctx.editMessageText(`❌ Failed to merge: ${error.message}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back to PR", callback_data: `pr:${repoId}:${prNumber}:detail` }],
        ],
      },
    });
  }
  console.log("🔀 [handlePrMergeConfirm] ⏹️ END");
}
