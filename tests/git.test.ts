import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getRepoTree, cleanupWorkspace } from "../src/modules/codegen/git.js";

const TEST_DIR = join("/tmp", "git-test-" + Date.now());

describe("getRepoTree", () => {
  beforeEach(async () => {
    await mkdir(join(TEST_DIR, "src", "utils"), { recursive: true });
    await writeFile(join(TEST_DIR, "package.json"), "{}");
    await writeFile(join(TEST_DIR, "src", "index.ts"), "");
    await writeFile(join(TEST_DIR, "src", "utils", "helper.ts"), "");
    await mkdir(join(TEST_DIR, ".git"), { recursive: true });
    await mkdir(join(TEST_DIR, "node_modules"), { recursive: true });
  });

  afterEach(async () => {
    await cleanupWorkspace(TEST_DIR);
  });

  it("lists files excluding .git and node_modules", async () => {
    const tree = await getRepoTree(TEST_DIR);
    expect(tree).toContain("package.json");
    expect(tree).toContain("src/");
    expect(tree).toContain("index.ts");
    expect(tree).not.toContain(".git");
    expect(tree).not.toContain("node_modules");
  });
});

describe("cleanupWorkspace", () => {
  it("removes directory and does not throw if missing", async () => {
    const dir = join("/tmp", "cleanup-test-" + Date.now());
    await mkdir(dir, { recursive: true });
    await cleanupWorkspace(dir);
    await expect(cleanupWorkspace(dir)).resolves.not.toThrow();
  });
});
