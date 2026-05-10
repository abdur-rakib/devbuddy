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
    console.log(`📲 [callback_query] Received — data="${data}", telegramId=${ctx.from?.id}`);

    try {
      // Menu navigation
      if (data === "menu:main") { console.log("📲 [callback_query] Routing to showMainMenu"); return showMainMenu(ctx); }
      if (data === "menu:repos") { console.log("📲 [callback_query] Routing to handleRepoList"); return handleRepoList(ctx); }
      if (data === "menu:chat") { console.log("📲 [callback_query] Routing to handleChatStart"); return handleChatStart(ctx); }
      if (data === "menu:settings") { console.log("📲 [callback_query] Routing to handleSettings"); return handleSettings(ctx); }
      if (data === "menu:help") { console.log("📲 [callback_query] Routing to showHelp"); return showHelp(ctx); }
      if (data === "noop") return ctx.answerCallbackQuery();

      // Settings
      if (data === "settings:update_token") { console.log("📲 [callback_query] Routing to handleUpdateToken"); return handleUpdateToken(ctx); }

      // Chat
      if (data === "chat:new") { console.log("📲 [callback_query] Routing to handleChatStart"); return handleChatStart(ctx); }

      // Repo pagination
      const repoPageMatch = data.match(/^repos:page:(\d+)$/);
      if (repoPageMatch) { console.log(`📲 [callback_query] Routing to handleRepoList — page=${repoPageMatch[1]}`); return handleRepoList(ctx, parseInt(repoPageMatch[1]!)); }

      // Repo selection
      const repoSelectMatch = data.match(/^repo:(\d+):select$/);
      if (repoSelectMatch) { console.log(`📲 [callback_query] Routing to handleRepoSelect — repoId=${repoSelectMatch[1]}`); return handleRepoSelect(ctx, parseInt(repoSelectMatch[1]!)); }

      // Repo sub-menus
      const repoActionMatch = data.match(/^repo:(\d+):(prs|issues|branches|codegen)$/);
      if (repoActionMatch) {
        const repoId = parseInt(repoActionMatch[1]!);
        const action = repoActionMatch[2]!;
        console.log(`📲 [callback_query] Routing to repo action — repoId=${repoId}, action=${action}`);
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
        console.log(`📲 [callback_query] Routing to PR action — repoId=${repoId}, prNumber=${prNumber}, action=${action}`);
        if (action === "detail") return handlePrDetail(ctx, repoId, prNumber);
        if (action === "diff") return handlePrDiff(ctx, repoId, prNumber);
        if (action === "review") return handlePrReview(ctx, repoId, prNumber);
        if (action === "approve") return handlePrApprove(ctx, repoId, prNumber);
        if (action === "merge") return handlePrMerge(ctx, repoId, prNumber);
      }

      // PR merge method
      const mergeMatch = data.match(/^pr:(\d+):(\d+):merge:(merge|squash|rebase)$/);
      if (mergeMatch) {
        console.log(`📲 [callback_query] Routing to handlePrMergeConfirm — method=${mergeMatch[3]}`);
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
        console.log(`📲 [callback_query] Routing to codegen action — jobId=${jobId}, action=${action}`);
        if (action === "create_pr") return handleCodeGenCreatePr(ctx, jobId);
        if (action === "diff") return handleCodeGenDiff(ctx, jobId);
        if (action === "revise") return handleCodeGenRevise(ctx, jobId);
        if (action === "cancel") return handleCodeGenCancel(ctx, jobId);
      }

      console.log(`⚠️ [callback_query] Unknown action — data="${data}"`);
      await ctx.answerCallbackQuery("Unknown action");
    } catch (error: any) {
      console.error(`❌ [callback_query] Error — data="${data}", error=${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
      await ctx.answerCallbackQuery("Something went wrong");
    }
  });

  // Text message handler (catch-all)
  bot.on("message:text", async (ctx) => {
    if (ctx.session.onboardingStep === "awaiting_token") {
      console.log(`📨 [message:text] Routing to handleTokenInput — telegramId=${ctx.from?.id}`);
      return handleTokenInput(ctx);
    }
    if (ctx.session.codegenAwaitingDescription) {
      console.log(`📨 [message:text] Routing to handleCodeGenDescription — telegramId=${ctx.from?.id}`);
      return handleCodeGenDescription(ctx);
    }
    if (ctx.session.codegenAwaitingRevision) {
      console.log(`📨 [message:text] Routing to handleCodeGenRevisionInput — telegramId=${ctx.from?.id}`);
      return handleCodeGenRevisionInput(ctx);
    }
    console.log(`📨 [message:text] Routing to handleChatMessage — telegramId=${ctx.from?.id}`);
    return handleChatMessage(ctx);
  });

  bot.catch((err) => {
    console.error(`❌ [bot.catch] Unhandled error — ${JSON.stringify(err.error, Object.getOwnPropertyNames(err.error))}`);
  });

  return bot;
}
