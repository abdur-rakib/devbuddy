import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { applyFileChanges } from "../src/modules/codegen/worker.js";
import type { FileChange } from "../src/modules/codegen/types.js";

const TEST_DIR = join(process.cwd(), ".test-worker-tmp");

describe("applyFileChanges", () => {
  beforeEach(async () => {
    // Clean up test directory if it exists
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist yet
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Already cleaned up
    }
  });

  it("creates a new file with content", async () => {
    const changes: FileChange[] = [
      {
        action: "create",
        path: "test.txt",
        content: "Hello, World!",
      },
    ];

    await applyFileChanges(TEST_DIR, changes);

    const filePath = join(TEST_DIR, "test.txt");
    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("Hello, World!");
  });

  it("creates files in nested directories (auto-creates parent dirs)", async () => {
    const changes: FileChange[] = [
      {
        action: "create",
        path: "src/components/Button.tsx",
        content: "export const Button = () => <button>Click</button>;",
      },
    ];

    await applyFileChanges(TEST_DIR, changes);

    const filePath = join(TEST_DIR, "src/components/Button.tsx");
    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("export const Button = () => <button>Click</button>;");
  });

  it("modifies an existing file", async () => {
    const changes: FileChange[] = [
      {
        action: "create",
        path: "config.json",
        content: '{"version": "1.0"}',
      },
    ];

    await applyFileChanges(TEST_DIR, changes);

    const modifyChanges: FileChange[] = [
      {
        action: "modify",
        path: "config.json",
        content: '{"version": "2.0", "updated": true}',
      },
    ];

    await applyFileChanges(TEST_DIR, modifyChanges);

    const filePath = join(TEST_DIR, "config.json");
    const content = await readFile(filePath, "utf-8");
    expect(content).toBe('{"version": "2.0", "updated": true}');
  });

  it("deletes an existing file", async () => {
    const changes: FileChange[] = [
      {
        action: "create",
        path: "to-delete.txt",
        content: "This will be deleted",
      },
    ];

    await applyFileChanges(TEST_DIR, changes);

    const deleteChanges: FileChange[] = [
      {
        action: "delete",
        path: "to-delete.txt",
      },
    ];

    await applyFileChanges(TEST_DIR, deleteChanges);

    const filePath = join(TEST_DIR, "to-delete.txt");
    await expect(readFile(filePath, "utf-8")).rejects.toThrow();
  });

  it("throws error when create action has no content", async () => {
    const changes: FileChange[] = [
      {
        action: "create",
        path: "no-content.txt",
      },
    ];

    await expect(applyFileChanges(TEST_DIR, changes)).rejects.toThrow(
      "Missing content for create: no-content.txt"
    );
  });

  it("throws error when modify action has no content", async () => {
    const changes: FileChange[] = [
      {
        action: "modify",
        path: "no-content.txt",
      },
    ];

    await expect(applyFileChanges(TEST_DIR, changes)).rejects.toThrow(
      "Missing content for modify: no-content.txt"
    );
  });

  it("delete does not throw for non-existent file", async () => {
    const changes: FileChange[] = [
      {
        action: "delete",
        path: "non-existent-file.txt",
      },
    ];

    // Should not throw
    await expect(applyFileChanges(TEST_DIR, changes)).resolves.toBeUndefined();
  });

  it("handles multiple changes in one call", async () => {
    const changes: FileChange[] = [
      {
        action: "create",
        path: "file1.txt",
        content: "File 1",
      },
      {
        action: "create",
        path: "dir/file2.txt",
        content: "File 2",
      },
      {
        action: "create",
        path: "file3.txt",
        content: "File 3",
      },
    ];

    await applyFileChanges(TEST_DIR, changes);

    const content1 = await readFile(join(TEST_DIR, "file1.txt"), "utf-8");
    const content2 = await readFile(join(TEST_DIR, "dir/file2.txt"), "utf-8");
    const content3 = await readFile(join(TEST_DIR, "file3.txt"), "utf-8");

    expect(content1).toBe("File 1");
    expect(content2).toBe("File 2");
    expect(content3).toBe("File 3");
  });
});
