import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { BotContext } from "../auth/types.js";
import { getDb } from "../../db/client.js";
import { decrypt } from "../auth/crypto.js";
import { config } from "../../config.js";
import { createOctokit } from "../github/client.js";
import { CopilotClient } from "../../utils/copilot-api.js";
import { cloneRepo, createBranch, commitAll, pushBranch, getRepoTree, cleanupWorkspace } from "./git.js";
import { applyFileChanges } from "./worker.js";
import { buildCodeGenSystemPrompt, CODEGEN_REVISION_PROMPT } from "./prompts.js";
import { codegenReviewKeyboard } from "../../ui/keyboards.js";
import { chunkMessage } from "../../utils/telegram.js";
import type { CodeGenResult, CodeGenJob } from "./types.js";
import { execa } from "execa";

export async function handleCodeGenStart(ctx: BotContext, repoId: number): Promise<void> {
  console.log(`🛠️ [handleCodeGenStart] START — repoId=${repoId}, telegramId=${ctx.from?.id}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("🛠️ [handleCodeGenStart] No user found, exiting early");
    return;
  }

  const db = getDb();
  const activeJob = db
    .prepare("SELECT * FROM codegen_jobs WHERE user_id = ? AND status IN ('pending', 'running', 'review')")
    .get(ctx.user.id) as CodeGenJob | undefined;

  if (activeJob) {
    console.log(`⚠️ [handleCodeGenStart] Active job already exists — jobId=${activeJob.id}, status=${activeJob.status}`);
    await ctx.editMessageText("⚠️ You already have an active code generation job. Please finish or cancel it first.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back", callback_data: `repo:${repoId}:select` }],
        ],
      },
    });
    return;
  }

  console.log("🛠️ [handleCodeGenStart] No active job, awaiting description");
  ctx.session.codegenAwaitingDescription = true;

  const repo = db.prepare("SELECT * FROM repos WHERE id = ?").get(repoId) as any;
  await ctx.editMessageText(
    `🤖 *New Feature — ${repo.full_name}*\n\nDescribe what you want to build:`,
    { parse_mode: "Markdown" }
  );
  console.log("🛠️ [handleCodeGenStart] END");
}

export async function handleCodeGenDescription(ctx: BotContext): Promise<void> {
  console.log(`🛠️ [handleCodeGenDescription] START — telegramId=${ctx.from?.id}`);
  if (!ctx.session.codegenAwaitingDescription || !ctx.user) {
    console.log("🛠️ [handleCodeGenDescription] Not awaiting description or no user, exiting early");
    return;
  }

  const description = ctx.message?.text?.trim();
  if (!description) {
    console.log("🛠️ [handleCodeGenDescription] Empty description, exiting early");
    return;
  }

  ctx.session.codegenAwaitingDescription = false;

  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?")
    .get(ctx.user.active_repo_id, ctx.user.id) as any;

  if (!repo) {
    console.log("🛠️ [handleCodeGenDescription] No active repo found");
    await ctx.reply("❌ No active repo selected.");
    return;
  }
  console.log(`🛠️ [handleCodeGenDescription] Repo found — fullName=${repo.full_name}`);

  const jobId = randomUUID();
  const branchName = `feature/${description.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${jobId.slice(0, 6)}`;
  const workspacePath = join(config.codegenDir, jobId);
  console.log(`🛠️ [handleCodeGenDescription] Job created — jobId=${jobId}, branch=${branchName}`);

  db.prepare(
    `INSERT INTO codegen_jobs (id, user_id, repo_id, description, status, branch_name, workspace_path)
     VALUES (?, ?, ?, ?, 'running', ?, ?)`
  ).run(jobId, ctx.user.id, repo.id, description, branchName, workspacePath);

  ctx.session.codegenJobId = jobId;

  await ctx.reply("🔄 Working on it... Cloning repo, analyzing code, generating changes...");

  try {
    const githubToken = decrypt(ctx.user.github_token_enc, config.encryptionKey);
    const copilotToken = decrypt(ctx.user.copilot_token_enc, config.encryptionKey);

    console.log(`📦 [handleCodeGenDescription] Cloning repo — fullName=${repo.full_name}`);
    await cloneRepo(`https://github.com/${repo.full_name}.git`, workspacePath, githubToken);
    console.log("📦 [handleCodeGenDescription] Clone complete");

    console.log(`🌿 [handleCodeGenDescription] Creating branch — branch=${branchName}`);
    await createBranch(workspacePath, branchName);
    console.log("🌿 [handleCodeGenDescription] Branch created");

    console.log("🌳 [handleCodeGenDescription] Getting repo tree");
    const repoTree = await getRepoTree(workspacePath);
    console.log(`🌳 [handleCodeGenDescription] Repo tree retrieved — length=${repoTree.length}`);

    const systemPrompt = buildCodeGenSystemPrompt(repoTree);

    const copilot = new CopilotClient(copilotToken);
    console.log("🤖 [handleCodeGenDescription] Starting AI codegen call");
    const response = await copilot.chatCompletion(systemPrompt, [
      { role: "user", content: description },
    ]);
    console.log(`🤖 [handleCodeGenDescription] AI codegen call complete — responseLength=${response.length}`);

    let result: CodeGenResult;
    try {
      result = JSON.parse(response);
      console.log(`✅ [handleCodeGenDescription] JSON parse successful — fileCount=${result.files.length}, summary="${result.summary}"`);
    } catch (parseError) {
      console.error(`❌ [handleCodeGenDescription] JSON parse failed — error=${JSON.stringify(parseError, Object.getOwnPropertyNames(parseError as object))}`);
      throw new Error("AI returned invalid response format");
    }

    console.log(`📝 [handleCodeGenDescription] Applying file changes — fileCount=${result.files.length}`);
    await applyFileChanges(workspacePath, result.files);
    console.log("📝 [handleCodeGenDescription] File changes applied");

    console.log(`💾 [handleCodeGenDescription] Committing — message="${result.commitMessage}"`);
    await commitAll(workspacePath, result.commitMessage);
    console.log("💾 [handleCodeGenDescription] Commit complete");

    db.prepare("UPDATE codegen_jobs SET status = 'review' WHERE id = ?").run(jobId);

    const fileList = result.files
      .map((f) => `${f.action === "create" ? "➕" : f.action === "modify" ? "📝" : "🗑️"} ${f.path}`)
      .join("\n");

    await ctx.reply(
      `✅ *Changes ready for review*\n\n📝 ${result.summary}\n\n*Files changed:*\n${fileList}`,
      {
        parse_mode: "Markdown",
        reply_markup: codegenReviewKeyboard(jobId),
      }
    );
    console.log(`🛠️ [handleCodeGenDescription] END — success, jobId=${jobId}`);
  } catch (error: any) {
    console.error(`❌ [handleCodeGenDescription] Error — jobId=${jobId}, error=${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    db.prepare("UPDATE codegen_jobs SET status = 'failed' WHERE id = ?").run(jobId);
    await cleanupWorkspace(workspacePath);
    await ctx.reply(`❌ Code generation failed: ${error.message}`);
  }
}

export async function handleCodeGenDiff(ctx: BotContext, jobId: string): Promise<void> {
  console.log(`🛠️ [handleCodeGenDiff] START — jobId=${jobId}, telegramId=${ctx.from?.id}`);
  await ctx.answerCallbackQuery();

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ?").get(jobId) as CodeGenJob | undefined;
  if (!job?.workspace_path) {
    console.log(`🛠️ [handleCodeGenDiff] Job not found or no workspace — jobId=${jobId}`);
    return;
  }
  console.log(`🛠️ [handleCodeGenDiff] Job found — workspace=${job.workspace_path}`);

  try {
    const { stdout } = await execa("git", ["diff", "HEAD~1"], { cwd: job.workspace_path });
    console.log(`🛠️ [handleCodeGenDiff] Diff retrieved — length=${stdout.length}`);
    const chunks = chunkMessage(`\`\`\`diff\n${stdout}\n\`\`\``, 4000);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
    console.log(`🛠️ [handleCodeGenDiff] END — sent ${chunks.length} chunk(s)`);
  } catch (error: any) {
    console.error(`❌ [handleCodeGenDiff] Error — jobId=${jobId}, error=${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    await ctx.reply(`❌ Failed to get diff: ${error.message}`);
  }
}

export async function handleCodeGenRevise(ctx: BotContext, jobId: string): Promise<void> {
  console.log(`🛠️ [handleCodeGenRevise] START — jobId=${jobId}, telegramId=${ctx.from?.id}`);
  await ctx.answerCallbackQuery();
  ctx.session.codegenJobId = jobId;
  ctx.session.codegenAwaitingRevision = true;
  await ctx.reply("🔄 Describe what changes you want:");
  console.log("🛠️ [handleCodeGenRevise] END — awaiting revision input");
}

export async function handleCodeGenRevisionInput(ctx: BotContext): Promise<void> {
  console.log(`🛠️ [handleCodeGenRevisionInput] START — telegramId=${ctx.from?.id}`);
  if (!ctx.session.codegenAwaitingRevision || !ctx.user) {
    console.log("🛠️ [handleCodeGenRevisionInput] Not awaiting revision or no user, exiting early");
    return;
  }

  const feedback = ctx.message?.text?.trim();
  if (!feedback) {
    console.log("🛠️ [handleCodeGenRevisionInput] Empty feedback, exiting early");
    return;
  }

  ctx.session.codegenAwaitingRevision = false;
  const jobId = ctx.session.codegenJobId;
  if (!jobId) {
    console.log("🛠️ [handleCodeGenRevisionInput] No jobId in session, exiting early");
    return;
  }

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ? AND user_id = ?")
    .get(jobId, ctx.user.id) as CodeGenJob | undefined;
  if (!job?.workspace_path) {
    console.log(`🛠️ [handleCodeGenRevisionInput] Job not found — jobId=${jobId}`);
    return;
  }
  console.log(`🛠️ [handleCodeGenRevisionInput] Job found — jobId=${jobId}, workspace=${job.workspace_path}`);

  await ctx.reply("🔄 Revising code...");

  try {
    const copilotToken = decrypt(ctx.user.copilot_token_enc, config.encryptionKey);

    console.log("🌳 [handleCodeGenRevisionInput] Getting repo tree");
    const repoTree = await getRepoTree(job.workspace_path);
    console.log(`🌳 [handleCodeGenRevisionInput] Repo tree retrieved — length=${repoTree.length}`);

    const systemPrompt = buildCodeGenSystemPrompt(repoTree) + "\n\n" + CODEGEN_REVISION_PROMPT;

    const copilot = new CopilotClient(copilotToken);
    console.log("🤖 [handleCodeGenRevisionInput] Starting AI revision call");
    const response = await copilot.chatCompletion(systemPrompt, [
      { role: "user", content: job.description },
      { role: "assistant", content: "I made the initial changes." },
      { role: "user", content: `Revision requested: ${feedback}` },
    ]);
    console.log(`🤖 [handleCodeGenRevisionInput] AI revision call complete — responseLength=${response.length}`);

    let result: CodeGenResult;
    try {
      result = JSON.parse(response);
      console.log(`✅ [handleCodeGenRevisionInput] JSON parse successful — fileCount=${result.files.length}`);
    } catch (parseError) {
      console.error(`❌ [handleCodeGenRevisionInput] JSON parse failed — error=${JSON.stringify(parseError, Object.getOwnPropertyNames(parseError as object))}`);
      throw parseError;
    }

    console.log(`📝 [handleCodeGenRevisionInput] Applying file changes — fileCount=${result.files.length}`);
    await applyFileChanges(job.workspace_path, result.files);
    console.log("📝 [handleCodeGenRevisionInput] File changes applied");

    console.log(`💾 [handleCodeGenRevisionInput] Committing — message="refactor: ${result.commitMessage}"`);
    await commitAll(job.workspace_path, `refactor: ${result.commitMessage}`);
    console.log("💾 [handleCodeGenRevisionInput] Commit complete");

    const fileList = result.files
      .map((f) => `${f.action === "create" ? "➕" : f.action === "modify" ? "📝" : "🗑️"} ${f.path}`)
      .join("\n");

    await ctx.reply(
      `✅ *Revision complete*\n\n📝 ${result.summary}\n\n*Files changed:*\n${fileList}`,
      {
        parse_mode: "Markdown",
        reply_markup: codegenReviewKeyboard(jobId),
      }
    );
    console.log(`🛠️ [handleCodeGenRevisionInput] END — success, jobId=${jobId}`);
  } catch (error: any) {
    console.error(`❌ [handleCodeGenRevisionInput] Error — jobId=${jobId}, error=${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    await ctx.reply(`❌ Revision failed: ${error.message}`);
  }
}

export async function handleCodeGenCreatePr(ctx: BotContext, jobId: string): Promise<void> {
  console.log(`🛠️ [handleCodeGenCreatePr] START — jobId=${jobId}, telegramId=${ctx.from?.id}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("🛠️ [handleCodeGenCreatePr] No user found, exiting early");
    return;
  }

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ? AND user_id = ?")
    .get(jobId, ctx.user.id) as CodeGenJob | undefined;
  if (!job?.workspace_path || !job.branch_name) {
    console.log(`🛠️ [handleCodeGenCreatePr] Job not found or missing workspace/branch — jobId=${jobId}`);
    return;
  }

  const repo = db.prepare("SELECT * FROM repos WHERE id = ?").get(job.repo_id) as any;
  if (!repo) {
    console.log(`🛠️ [handleCodeGenCreatePr] Repo not found — repoId=${job.repo_id}`);
    return;
  }
  console.log(`🛠️ [handleCodeGenCreatePr] Job and repo found — repo=${repo.full_name}, branch=${job.branch_name}`);

  await ctx.editMessageText("🔄 Pushing branch and creating PR...");

  try {
    console.log(`🚀 [handleCodeGenCreatePr] Pushing branch — branch=${job.branch_name}`);
    await pushBranch(job.workspace_path, job.branch_name);
    console.log("🚀 [handleCodeGenCreatePr] Branch pushed");

    const [owner, repoName] = repo.full_name.split("/");
    const octokit = createOctokit(ctx.user);

    console.log(`📋 [handleCodeGenCreatePr] Creating PR — owner=${owner}, repo=${repoName}, head=${job.branch_name}, base=${repo.default_branch ?? "main"}`);
    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo: repoName,
      title: job.description,
      body: `🤖 Auto-generated by Telegram GitHub Bot\n\n${job.description}`,
      head: job.branch_name,
      base: repo.default_branch ?? "main",
    });
    console.log(`✅ [handleCodeGenCreatePr] PR created — prNumber=${pr.number}, url=${pr.html_url}`);

    db.prepare("UPDATE codegen_jobs SET status = 'done', pr_url = ? WHERE id = ?")
      .run(pr.html_url, jobId);

    await cleanupWorkspace(job.workspace_path);
    console.log("🧹 [handleCodeGenCreatePr] Workspace cleaned up");

    await ctx.editMessageText(
      `✅ *PR Created!*\n\n🔗 [PR #${pr.number}: ${job.description}](${pr.html_url})`,
      { parse_mode: "Markdown" }
    );
    console.log(`🛠️ [handleCodeGenCreatePr] END — success, jobId=${jobId}`);
  } catch (error: any) {
    console.error(`❌ [handleCodeGenCreatePr] Error — jobId=${jobId}, error=${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    await ctx.editMessageText(`❌ Failed to create PR: ${error.message}`);
  }
}

export async function handleCodeGenCancel(ctx: BotContext, jobId: string): Promise<void> {
  console.log(`🛠️ [handleCodeGenCancel] START — jobId=${jobId}, telegramId=${ctx.from?.id}`);
  await ctx.answerCallbackQuery();
  if (!ctx.user) {
    console.log("🛠️ [handleCodeGenCancel] No user found, exiting early");
    return;
  }

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ? AND user_id = ?")
    .get(jobId, ctx.user.id) as CodeGenJob | undefined;

  if (job?.workspace_path) {
    console.log(`🧹 [handleCodeGenCancel] Cleaning up workspace — path=${job.workspace_path}`);
    await cleanupWorkspace(job.workspace_path);
    console.log("🧹 [handleCodeGenCancel] Workspace cleaned up");
  }

  db.prepare("UPDATE codegen_jobs SET status = 'cancelled' WHERE id = ?").run(jobId);
  ctx.session.codegenJobId = undefined;

  await ctx.editMessageText("❌ Code generation cancelled.", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "◀️ Back to Menu", callback_data: "menu:main" }],
      ],
    },
  });
  console.log(`🛠️ [handleCodeGenCancel] END — jobId=${jobId} cancelled`);
}
