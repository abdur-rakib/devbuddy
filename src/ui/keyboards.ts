import type { InlineKeyboardButton } from "grammy/types";

type Row = InlineKeyboardButton[];

export function mainMenuKeyboard(): { inline_keyboard: Row[] } {
  return {
    inline_keyboard: [
      [
        { text: "📂 Repos", callback_data: "menu:repos" },
        { text: "💬 AI Chat", callback_data: "menu:chat" },
      ],
      [
        { text: "⚙️ Settings", callback_data: "menu:settings" },
        { text: "❓ Help", callback_data: "menu:help" },
      ],
    ],
  };
}

export function repoMenuKeyboard(repoId: number): { inline_keyboard: Row[] } {
  return {
    inline_keyboard: [
      [
        { text: "🔀 PRs", callback_data: `repo:${repoId}:prs` },
        { text: "🐛 Issues", callback_data: `repo:${repoId}:issues` },
      ],
      [
        { text: "🌿 Branches", callback_data: `repo:${repoId}:branches` },
        { text: "🤖 New Feature", callback_data: `repo:${repoId}:codegen` },
      ],
      [{ text: "◀️ Back to Repos", callback_data: "menu:repos" }],
    ],
  };
}

export function prDetailKeyboard(
  repoId: number,
  prNumber: number
): { inline_keyboard: Row[] } {
  return {
    inline_keyboard: [
      [
        { text: "📄 Diff", callback_data: `pr:${repoId}:${prNumber}:diff` },
        { text: "🤖 Review", callback_data: `pr:${repoId}:${prNumber}:review` },
        { text: "💬 Comments", callback_data: `pr:${repoId}:${prNumber}:comments` },
      ],
      [
        { text: "✅ Approve", callback_data: `pr:${repoId}:${prNumber}:approve` },
        { text: "🔀 Merge", callback_data: `pr:${repoId}:${prNumber}:merge` },
        { text: "◀️ Back", callback_data: `repo:${repoId}:prs` },
      ],
    ],
  };
}

export function paginationRow(
  prefix: string,
  page: number,
  hasNext: boolean,
  hasPrev: boolean
): Row {
  const row: Row = [];
  if (hasPrev) {
    row.push({ text: "◀️ Prev", callback_data: `${prefix}:page:${page - 1}` });
  }
  row.push({ text: `${page}`, callback_data: "noop" });
  if (hasNext) {
    row.push({ text: "Next ▶️", callback_data: `${prefix}:page:${page + 1}` });
  }
  return row;
}

export function codegenReviewKeyboard(jobId: string): { inline_keyboard: Row[] } {
  return {
    inline_keyboard: [
      [
        { text: "✅ Create PR", callback_data: `codegen:${jobId}:create_pr` },
        { text: "📄 View Full Diff", callback_data: `codegen:${jobId}:diff` },
      ],
      [
        { text: "🔄 Revise", callback_data: `codegen:${jobId}:revise` },
        { text: "❌ Cancel", callback_data: `codegen:${jobId}:cancel` },
      ],
    ],
  };
}

export function chatKeyboard(): { inline_keyboard: Row[] } {
  return {
    inline_keyboard: [
      [
        { text: "🔄 New Chat", callback_data: "chat:new" },
        { text: "◀️ Back", callback_data: "menu:main" },
      ],
    ],
  };
}
