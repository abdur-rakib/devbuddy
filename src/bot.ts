import { Bot, session } from "grammy";
import type { BotContext, SessionData } from "./modules/auth/types.js";
import { config } from "./config.js";
import { authMiddleware } from "./modules/auth/middleware.js";
import { handleStart, handleTokenInput, handleSettings, handleUpdateToken } from "./modules/auth/handlers.js";
import {
  handleRepoList, handleRepoSelect, handleIssueList,
  handlePrList, handlePrDetail, handlePrDiff,
  handleBranchList, handlePrApprove, handlePrMerge, handlePrMergeConfirm,
} from "./modules/github/handlers.js";
import { handlePrReview } from "./modules/review/handlers.js";
import {
  handleCodeGenStart, handleCodeGenDescription,
  handleCodeGenDiff, handleCodeGenRevise, handleCodeGenRevisionInput,
  handleCodeGenCreatePr, handleCodeGenCancel,
} from "./modules/codegen/handlers.js";
import { handleChatStart, handleChatMessage } from "./modules/chat/handlers.js";
import { showMainMenu, showHelp } from "./ui/menus.js";

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.telegramBotToken);

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );

  // Auth middleware
  bot.use(authMiddleware);

  // Commands
  bot.command("start", handleStart);
  bot.command("help", (ctx) => showHelp(ctx));

  // Callback query router
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    try {
      // Menu navigation
      if (data === "menu:main") return showMainMenu(ctx);
      if (data === "menu:repos") return handleRepoList(ctx);
      if (data === "menu:chat") return handleChatStart(ctx);
      if (data === "menu:settings") return handleSettings(ctx);
      if (data === "menu:help") return showHelp(ctx);
      if (data === "noop") return ctx.answerCallbackQuery();

      // Settings
      if (data === "settings:update_token") return handleUpdateToken(ctx);

      // Chat - use handleChatStart (no handleNewChat exists)
      if (data === "chat:new") return handleChatStart(ctx);

      // Repo pagination
      const repoPageMatch = data.match(/^repos:page:(\d+)$/);
      if (repoPageMatch) return handleRepoList(ctx, parseInt(repoPageMatch[1]!));

      // Repo selection
      const repoSelectMatch = data.match(/^repo:(\d+):select$/);
      if (repoSelectMatch) return handleRepoSelect(ctx, parseInt(repoSelectMatch[1]!));

      // Repo sub-menus
      const repoActionMatch = data.match(/^repo:(\d+):(prs|issues|branches|codegen)$/);
      if (repoActionMatch) {
        const repoId = parseInt(repoActionMatch[1]!);
        const action = repoActionMatch[2]!;
        if (action === "prs") return handlePrList(ctx, repoId);
        if (action === "issues") return handleIssueList(ctx, repoId);
        if (action === "branches") return handleBranchList(ctx, repoId);
        if (action === "codegen") return handleCodeGenStart(ctx, repoId);
      }

      // PR actions
      const prActionMatch = data.match(/^pr:(\d+):(\d+):(detail|diff|review|approve|merge)$/);
      if (prActionMatch) {
        const repoId = parseInt(prActionMatch[1]!);
        const prNumber = parseInt(prActionMatch[2]!);
        const action = prActionMatch[3]!;
        if (action === "detail") return handlePrDetail(ctx, repoId, prNumber);
        if (action === "diff") return handlePrDiff(ctx, repoId, prNumber);
        if (action === "review") return handlePrReview(ctx, repoId, prNumber);
        if (action === "approve") return handlePrApprove(ctx, repoId, prNumber);
        if (action === "merge") return handlePrMerge(ctx, repoId, prNumber);
      }

      // PR merge method
      const mergeMatch = data.match(/^pr:(\d+):(\d+):merge:(merge|squash|rebase)$/);
      if (mergeMatch) {
        return handlePrMergeConfirm(
          ctx,
          parseInt(mergeMatch[1]!),
          parseInt(mergeMatch[2]!),
          mergeMatch[3]! as "merge" | "squash" | "rebase"
        );
      }

      // CodeGen actions
      const codegenMatch = data.match(/^codegen:([^:]+):(create_pr|diff|revise|cancel)$/);
      if (codegenMatch) {
        const jobId = codegenMatch[1]!;
        const action = codegenMatch[2]!;
        if (action === "create_pr") return handleCodeGenCreatePr(ctx, jobId);
        if (action === "diff") return handleCodeGenDiff(ctx, jobId);
        if (action === "revise") return handleCodeGenRevise(ctx, jobId);
        if (action === "cancel") return handleCodeGenCancel(ctx, jobId);
      }

      await ctx.answerCallbackQuery("Unknown action");
    } catch (error: any) {
      console.error("Callback error:", error);
      await ctx.answerCallbackQuery("Something went wrong");
    }
  });

  // Text message handler (catch-all)
  bot.on("message:text", async (ctx) => {
    if (ctx.session.onboardingStep === "awaiting_token") {
      return handleTokenInput(ctx);
    }
    if (ctx.session.codegenAwaitingDescription) {
      return handleCodeGenDescription(ctx);
    }
    if (ctx.session.codegenAwaitingRevision) {
      return handleCodeGenRevisionInput(ctx);
    }
    return handleChatMessage(ctx);
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return bot;
}
