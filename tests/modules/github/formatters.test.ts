import { describe, it, expect } from "vitest";
import {
  formatRepoList,
  formatIssue,
  formatPrSummary,
} from "../../../src/modules/github/formatters.js";

describe("formatRepoList", () => {
  it("formats repos with owner/name", () => {
    const repos = [
      { full_name: "user/repo1", description: "A cool project" },
      { full_name: "user/repo2", description: null },
    ];
    const result = formatRepoList(repos);
    expect(result).toContain("user/repo1");
    expect(result).toContain("A cool project");
    expect(result).toContain("user/repo2");
  });
});

describe("formatIssue", () => {
  it("formats issue with number, title, and labels", () => {
    const result = formatIssue({
      number: 42,
      title: "Bug in login",
      state: "open",
      labels: ["bug", "urgent"],
      user: "john",
    });
    expect(result).toContain("#42");
    expect(result).toContain("Bug in login");
    expect(result).toContain("bug");
  });
});

describe("formatPrSummary", () => {
  it("formats PR with status info", () => {
    const result = formatPrSummary({
      number: 10,
      title: "Add feature",
      state: "open",
      user: "jane",
      head: "feature/add",
      base: "main",
    });
    expect(result).toContain("#10");
    expect(result).toContain("Add feature");
    expect(result).toContain("main ← feature/add");
  });
});
