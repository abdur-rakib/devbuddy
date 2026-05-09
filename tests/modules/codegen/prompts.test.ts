import { describe, it, expect } from "vitest";
import {
  buildCodeGenSystemPrompt,
  CODEGEN_REVISION_PROMPT,
} from "../../../src/modules/codegen/prompts.js";
import { CHAT_SYSTEM_PROMPT } from "../../../src/modules/chat/prompts.js";

describe("buildCodeGenSystemPrompt", () => {
  it("includes repo structure in output", () => {
    const repoStructure = `
src/
  components/
  utils/
package.json
    `;
    const prompt = buildCodeGenSystemPrompt(repoStructure);

    expect(prompt).toContain(repoStructure);
  });

  it("includes JSON format instructions", () => {
    const repoStructure = "src/";
    const prompt = buildCodeGenSystemPrompt(repoStructure);

    expect(prompt).toContain("JSON");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("files");
    expect(prompt).toContain("action");
    expect(prompt).toContain("path");
    expect(prompt).toContain("content");
    expect(prompt).toContain("commitMessage");
  });

  it("mentions expert software engineer", () => {
    const repoStructure = "src/";
    const prompt = buildCodeGenSystemPrompt(repoStructure);

    expect(prompt).toContain("expert software engineer");
  });

  it("includes rules about complete file content and JSON format", () => {
    const repoStructure = "src/";
    const prompt = buildCodeGenSystemPrompt(repoStructure);

    expect(prompt).toContain("COMPLETE new file content");
    expect(prompt).toContain("production-quality code");
    expect(prompt).toContain("valid JSON only");
  });
});

describe("CODEGEN_REVISION_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof CODEGEN_REVISION_PROMPT).toBe("string");
    expect(CODEGEN_REVISION_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions revision and feedback", () => {
    expect(CODEGEN_REVISION_PROMPT).toContain("revisions");
    expect(CODEGEN_REVISION_PROMPT).toContain("feedback");
  });

  it("mentions JSON format response", () => {
    expect(CODEGEN_REVISION_PROMPT).toContain("JSON format");
  });
});

describe("CHAT_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof CHAT_SYSTEM_PROMPT).toBe("string");
    expect(CHAT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions Telegram", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("Telegram");
  });

  it("mentions GitHub repository management", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("GitHub");
  });

  it("mentions helpful AI assistant", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("helpful AI assistant");
  });

  it("mentions relevant topics like code, Git, or DevOps", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("code");
  });
});
