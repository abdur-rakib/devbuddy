import { execa } from "execa";
import { mkdir, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export async function cloneRepo(
  repoUrl: string,
  targetDir: string,
  token: string
): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  const authedUrl = repoUrl.replace(
    "https://github.com/",
    `https://x-access-token:${token}@github.com/`
  );

  await execa("git", ["clone", "--depth", "1", authedUrl, targetDir]);
}

export async function createBranch(
  workDir: string,
  branchName: string
): Promise<void> {
  await execa("git", ["checkout", "-b", branchName], { cwd: workDir });
}

export async function commitAll(
  workDir: string,
  message: string
): Promise<void> {
  await execa("git", ["add", "-A"], { cwd: workDir });
  await execa("git", ["commit", "-m", message], { cwd: workDir });
}

export async function pushBranch(
  workDir: string,
  branchName: string
): Promise<void> {
  await execa("git", ["push", "origin", branchName], { cwd: workDir });
}

export async function getRepoTree(
  workDir: string,
  maxDepth: number = 3
): Promise<string> {
  const lines: string[] = [];

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        lines.push(`${prefix}${entry.name}/`);
        await walk(fullPath, prefix + "  ", depth + 1);
      } else {
        lines.push(`${prefix}${entry.name}`);
      }
    }
  }

  await walk(workDir, "", 0);
  return lines.join("\n");
}

export async function cleanupWorkspace(workDir: string): Promise<void> {
  try {
    await rm(workDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}
