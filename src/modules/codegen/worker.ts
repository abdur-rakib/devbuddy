import { writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FileChange } from "./types.js";

export async function applyFileChanges(
  workDir: string,
  changes: FileChange[]
): Promise<void> {
  for (const change of changes) {
    const fullPath = join(workDir, change.path);

    switch (change.action) {
      case "create":
      case "modify":
        if (!change.content) {
          throw new Error(`Missing content for ${change.action}: ${change.path}`);
        }
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, change.content, "utf-8");
        break;

      case "delete":
        try {
          await rm(fullPath);
        } catch {
          // File may not exist
        }
        break;
    }
  }
}
