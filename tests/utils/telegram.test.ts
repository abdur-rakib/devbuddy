import { describe, it, expect } from "vitest";
import { chunkMessage, escapeMarkdown } from "../../src/utils/telegram.js";

describe("chunkMessage", () => {
  it("returns single chunk for short message", () => {
    const chunks = chunkMessage("Hello world");
    expect(chunks).toEqual(["Hello world"]);
  });

  it("splits long message at newline boundaries", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}: ${"x".repeat(50)}`);
    const message = lines.join("\n");
    const chunks = chunkMessage(message, 500);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
    expect(chunks.join("\n")).toBe(message);
  });

  it("hard-splits lines exceeding max length", () => {
    const longLine = "x".repeat(5000);
    const chunks = chunkMessage(longLine, 4096);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.length).toBe(4096);
  });
});

describe("escapeMarkdown", () => {
  it("escapes MarkdownV2 special characters", () => {
    expect(escapeMarkdown("hello_world")).toBe("hello\\_world");
    expect(escapeMarkdown("a*b*c")).toBe("a\\*b\\*c");
  });
});
