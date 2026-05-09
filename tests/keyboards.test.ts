import { describe, it, expect } from "vitest";
import {
  mainMenuKeyboard,
  repoMenuKeyboard,
  prDetailKeyboard,
  paginationRow,
  codegenReviewKeyboard,
  chatKeyboard,
} from "../src/ui/keyboards.js";

describe("mainMenuKeyboard", () => {
  it("returns correct structure with repos, chat, settings, help buttons", () => {
    const keyboard = mainMenuKeyboard();

    expect(keyboard).toHaveProperty("inline_keyboard");
    expect(keyboard.inline_keyboard).toHaveLength(2);

    // First row: Repos and Chat
    const firstRow = keyboard.inline_keyboard[0];
    expect(firstRow).toHaveLength(2);
    expect(firstRow[0]).toEqual({
      text: "📂 Repos",
      callback_data: "menu:repos",
    });
    expect(firstRow[1]).toEqual({
      text: "💬 AI Chat",
      callback_data: "menu:chat",
    });

    // Second row: Settings and Help
    const secondRow = keyboard.inline_keyboard[1];
    expect(secondRow).toHaveLength(2);
    expect(secondRow[0]).toEqual({
      text: "⚙️ Settings",
      callback_data: "menu:settings",
    });
    expect(secondRow[1]).toEqual({
      text: "❓ Help",
      callback_data: "menu:help",
    });
  });
});

describe("repoMenuKeyboard", () => {
  it("includes repoId in callback_data", () => {
    const repoId = 5;
    const keyboard = repoMenuKeyboard(repoId);

    expect(keyboard).toHaveProperty("inline_keyboard");
    expect(keyboard.inline_keyboard).toHaveLength(3);

    // First row: PRs and Issues
    const firstRow = keyboard.inline_keyboard[0];
    expect(firstRow[0].callback_data).toBe("repo:5:prs");
    expect(firstRow[1].callback_data).toBe("repo:5:issues");

    // Second row: Branches and New Feature
    const secondRow = keyboard.inline_keyboard[1];
    expect(secondRow[0].callback_data).toBe("repo:5:branches");
    expect(secondRow[1].callback_data).toBe("repo:5:codegen");

    // Third row: Back button
    const thirdRow = keyboard.inline_keyboard[2];
    expect(thirdRow[0].callback_data).toBe("menu:repos");
  });

  it("works with different repoIds", () => {
    const keyboard = repoMenuKeyboard(123);
    const firstRow = keyboard.inline_keyboard[0];

    expect(firstRow[0].callback_data).toBe("repo:123:prs");
    expect(firstRow[1].callback_data).toBe("repo:123:issues");
  });
});

describe("prDetailKeyboard", () => {
  it("includes both repoId and prNumber in callback_data", () => {
    const repoId = 3;
    const prNumber = 42;
    const keyboard = prDetailKeyboard(repoId, prNumber);

    expect(keyboard).toHaveProperty("inline_keyboard");
    expect(keyboard.inline_keyboard).toHaveLength(2);

    // First row: Diff, Review, Comments
    const firstRow = keyboard.inline_keyboard[0];
    expect(firstRow).toHaveLength(3);
    expect(firstRow[0].callback_data).toBe("pr:3:42:diff");
    expect(firstRow[1].callback_data).toBe("pr:3:42:review");
    expect(firstRow[2].callback_data).toBe("pr:3:42:comments");

    // Second row: Approve, Merge, Back
    const secondRow = keyboard.inline_keyboard[1];
    expect(secondRow).toHaveLength(3);
    expect(secondRow[0].callback_data).toBe("pr:3:42:approve");
    expect(secondRow[1].callback_data).toBe("pr:3:42:merge");
    expect(secondRow[2].callback_data).toBe("repo:3:prs");
  });
});

describe("paginationRow", () => {
  it("with hasNext=true, hasPrev=false shows only Next button + page number", () => {
    const row = paginationRow("list", 1, true, false);

    expect(row).toHaveLength(2);
    expect(row[0].text).toBe("1");
    expect(row[0].callback_data).toBe("noop");
    expect(row[1].text).toBe("Next ▶️");
    expect(row[1].callback_data).toBe("list:page:2");
  });

  it("with both true shows Prev, page, Next", () => {
    const row = paginationRow("issues", 5, true, true);

    expect(row).toHaveLength(3);
    expect(row[0].text).toBe("◀️ Prev");
    expect(row[0].callback_data).toBe("issues:page:4");
    expect(row[1].text).toBe("5");
    expect(row[1].callback_data).toBe("noop");
    expect(row[2].text).toBe("Next ▶️");
    expect(row[2].callback_data).toBe("issues:page:6");
  });

  it("with both false shows only page number", () => {
    const row = paginationRow("prs", 3, false, false);

    expect(row).toHaveLength(1);
    expect(row[0].text).toBe("3");
    expect(row[0].callback_data).toBe("noop");
  });

  it("with hasPrev=true, hasNext=false shows only Prev button + page number", () => {
    const row = paginationRow("branches", 10, false, true);

    expect(row).toHaveLength(2);
    expect(row[0].text).toBe("◀️ Prev");
    expect(row[0].callback_data).toBe("branches:page:9");
    expect(row[1].text).toBe("10");
    expect(row[1].callback_data).toBe("noop");
  });
});

describe("codegenReviewKeyboard", () => {
  it("includes jobId in callback_data", () => {
    const jobId = "job-abc-123";
    const keyboard = codegenReviewKeyboard(jobId);

    expect(keyboard).toHaveProperty("inline_keyboard");
    expect(keyboard.inline_keyboard).toHaveLength(2);

    // First row: Create PR and View Full Diff
    const firstRow = keyboard.inline_keyboard[0];
    expect(firstRow).toHaveLength(2);
    expect(firstRow[0].callback_data).toBe("codegen:job-abc-123:create_pr");
    expect(firstRow[1].callback_data).toBe("codegen:job-abc-123:diff");

    // Second row: Revise and Cancel
    const secondRow = keyboard.inline_keyboard[1];
    expect(secondRow).toHaveLength(2);
    expect(secondRow[0].callback_data).toBe("codegen:job-abc-123:revise");
    expect(secondRow[1].callback_data).toBe("codegen:job-abc-123:cancel");
  });

  it("works with different jobIds", () => {
    const keyboard = codegenReviewKeyboard("xyz-789");
    const firstRow = keyboard.inline_keyboard[0];

    expect(firstRow[0].callback_data).toBe("codegen:xyz-789:create_pr");
    expect(firstRow[1].callback_data).toBe("codegen:xyz-789:diff");
  });
});

describe("chatKeyboard", () => {
  it("returns new chat and back buttons", () => {
    const keyboard = chatKeyboard();

    expect(keyboard).toHaveProperty("inline_keyboard");
    expect(keyboard.inline_keyboard).toHaveLength(1);

    const row = keyboard.inline_keyboard[0];
    expect(row).toHaveLength(2);
    expect(row[0]).toEqual({
      text: "🔄 New Chat",
      callback_data: "chat:new",
    });
    expect(row[1]).toEqual({
      text: "◀️ Back",
      callback_data: "menu:main",
    });
  });
});
