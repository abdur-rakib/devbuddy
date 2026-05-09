import { describe, it, expect, vi } from "vitest";
import { CopilotClient } from "../../src/utils/copilot-api.js";

// We'll test the message building logic, not actual HTTP calls
describe("CopilotClient", () => {
  it("constructs with token and default model", () => {
    const client = new CopilotClient("ghp_test123");
    expect(client).toBeDefined();
  });

  it("builds messages array correctly", () => {
    const client = new CopilotClient("ghp_test123");
    const messages = client.buildMessages(
      "You are a helpful assistant.",
      [{ role: "user", content: "Hello" }]
    );
    expect(messages).toEqual([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" },
    ]);
  });

  it("builds messages with conversation history", () => {
    const client = new CopilotClient("ghp_test123");
    const messages = client.buildMessages("System prompt", [
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Follow-up" },
    ]);
    expect(messages).toHaveLength(4); // system + 3 conversation
    expect(messages[0]!.role).toBe("system");
  });
});
