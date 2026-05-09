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
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const db = getDb();
  const activeJob = db
    .prepare("SELECT * FROM codegen_jobs WHERE user_id = ? AND status IN ('pending', 'running', 'review')")
    .get(ctx.user.id) as CodeGenJob | undefined;

  if (activeJob) {
    await ctx.editMessageText("⚠️ You already have an active code generation job. Please finish or cancel it first.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Back", callback_data: `repo:${repoId}:select` }],
        ],
      },
    });
    return;
  }

  ctx.session.codegenAwaitingDescription = true;

  const repo = db.prepare("SELECT * FROM repos WHERE id = ?").get(repoId) as any;
  await ctx.editMessageText(
    `🤖 *New Feature — ${repo.full_name}*\n\nDescribe what you want to build:`,
    { parse_mode: "Markdown" }
  );
}

export async function handleCodeGenDescription(ctx: BotContext): Promise<void> {
  if (!ctx.session.codegenAwaitingDescription || !ctx.user) return;

  const description = ctx.message?.text?.trim();
  if (!description) return;

  ctx.session.codegenAwaitingDescription = false;

  const db = getDb();
  const repo = db.prepare("SELECT * FROM repos WHERE id = ? AND user_id = ?")
    .get(ctx.user.active_repo_id, ctx.user.id) as any;

  if (!repo) {
    await ctx.reply("❌ No active repo selected.");
    return;
  }

  const jobId = randomUUID();
  const branchName = `feature/${description.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${jobId.slice(0, 6)}`;
  const workspacePath = join(config.codegenDir, jobId);

  db.prepare(
    `INSERT INTO codegen_jobs (id, user_id, repo_id, description, status, branch_name, workspace_path)
     VALUES (?, ?, ?, ?, 'running', ?, ?)`
  ).run(jobId, ctx.user.id, repo.id, description, branchName, workspacePath);

  ctx.session.codegenJobId = jobId;

  await ctx.reply("🔄 Working on it... Cloning repo, analyzing code, generating changes...");

  try {
    const token = decrypt(ctx.user.github_token_enc, config.encryptionKey);

    await cloneRepo(`https://github.com/${repo.full_name}.git`, workspacePath, token);
    await createBranch(workspacePath, branchName);

    const repoTree = await getRepoTree(workspacePath);
    const systemPrompt = buildCodeGenSystemPrompt(repoTree);

    const copilot = new CopilotClient(token);
    const response = await copilot.chatCompletion(systemPrompt, [
      { role: "user", content: description },
    ]);

    let result: CodeGenResult;
    try {
      result = JSON.parse(response);
    } catch {
      throw new Error("AI returned invalid response format");
    }

    await applyFileChanges(workspacePath, result.files);
    await commitAll(workspacePath, result.commitMessage);

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
  } catch (error: any) {
    db.prepare("UPDATE codegen_jobs SET status = 'failed' WHERE id = ?").run(jobId);
    await cleanupWorkspace(workspacePath);
    await ctx.reply(`❌ Code generation failed: ${error.message}`);
  }
}

export async function handleCodeGenDiff(ctx: BotContext, jobId: string): Promise<void> {
  await ctx.answerCallbackQuery();

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ?").get(jobId) as CodeGenJob | undefined;
  if (!job?.workspace_path) return;

  try {
    const { stdout } = await execa("git", ["diff", "HEAD~1"], { cwd: job.workspace_path });
    const chunks = chunkMessage(`\`\`\`diff\n${stdout}\n\`\`\``, 4000);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
  } catch (error: any) {
    await ctx.reply(`❌ Failed to get diff: ${error.message}`);
  }
}

export async function handleCodeGenRevise(ctx: BotContext, jobId: string): Promise<void> {
  await ctx.answerCallbackQuery();
  ctx.session.codegenJobId = jobId;
  ctx.session.codegenAwaitingRevision = true;
  await ctx.reply("🔄 Describe what changes you want:");
}

export async function handleCodeGenRevisionInput(ctx: BotContext): Promise<void> {
  if (!ctx.session.codegenAwaitingRevision || !ctx.user) return;

  const feedback = ctx.message?.text?.trim();
  if (!feedback) return;

  ctx.session.codegenAwaitingRevision = false;
  const jobId = ctx.session.codegenJobId;
  if (!jobId) return;

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ? AND user_id = ?")
    .get(jobId, ctx.user.id) as CodeGenJob | undefined;
  if (!job?.workspace_path) return;

  await ctx.reply("🔄 Revising code...");

  try {
    const token = decrypt(ctx.user.github_token_enc, config.encryptionKey);
    const repoTree = await getRepoTree(job.workspace_path);
    const systemPrompt = buildCodeGenSystemPrompt(repoTree) + "\n\n" + CODEGEN_REVISION_PROMPT;

    const copilot = new CopilotClient(token);
    const response = await copilot.chatCompletion(systemPrompt, [
      { role: "user", content: job.description },
      { role: "assistant", content: "I made the initial changes." },
      { role: "user", content: `Revision requested: ${feedback}` },
    ]);

    const result: CodeGenResult = JSON.parse(response);
    await applyFileChanges(job.workspace_path, result.files);
    await commitAll(job.workspace_path, `refactor: ${result.commitMessage}`);

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
  } catch (error: any) {
    await ctx.reply(`❌ Revision failed: ${error.message}`);
  }
}

export async function handleCodeGenCreatePr(ctx: BotContext, jobId: string): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ? AND user_id = ?")
    .get(jobId, ctx.user.id) as CodeGenJob | undefined;
  if (!job?.workspace_path || !job.branch_name) return;

  const repo = db.prepare("SELECT * FROM repos WHERE id = ?").get(job.repo_id) as any;
  if (!repo) return;

  await ctx.editMessageText("🔄 Pushing branch and creating PR...");

  try {
    await pushBranch(job.workspace_path, job.branch_name);

    const [owner, repoName] = repo.full_name.split("/");
    const octokit = createOctokit(ctx.user);

    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo: repoName,
      title: job.description,
      body: `🤖 Auto-generated by Telegram GitHub Bot\n\n${job.description}`,
      head: job.branch_name,
      base: repo.default_branch ?? "main",
    });

    db.prepare("UPDATE codegen_jobs SET status = 'done', pr_url = ? WHERE id = ?")
      .run(pr.html_url, jobId);

    await cleanupWorkspace(job.workspace_path);

    await ctx.editMessageText(
      `✅ *PR Created!*\n\n🔗 [PR #${pr.number}: ${job.description}](${pr.html_url})`,
      { parse_mode: "Markdown" }
    );
  } catch (error: any) {
    await ctx.editMessageText(`❌ Failed to create PR: ${error.message}`);
  }
}

export async function handleCodeGenCancel(ctx: BotContext, jobId: string): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;

  const db = getDb();
  const job = db.prepare("SELECT * FROM codegen_jobs WHERE id = ? AND user_id = ?")
    .get(jobId, ctx.user.id) as CodeGenJob | undefined;

  if (job?.workspace_path) {
    await cleanupWorkspace(job.workspace_path);
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
}
