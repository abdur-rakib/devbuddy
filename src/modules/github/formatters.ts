import type { RepoInfo, IssueInfo, PrInfo, BranchInfo } from "./types.js";

export function formatRepoList(repos: RepoInfo[]): string {
  if (repos.length === 0) return "No repositories found.";

  return repos
    .map((r) => {
      const desc = r.description ? ` — ${r.description}` : "";
      return `📂 *${r.full_name}*${desc}`;
    })
    .join("\n\n");
}

export function formatIssue(issue: IssueInfo): string {
  const labels = issue.labels.length
    ? ` [${issue.labels.join(", ")}]`
    : "";
  const stateEmoji = issue.state === "open" ? "🟢" : "🔴";
  return `${stateEmoji} *#${issue.number}* ${issue.title}${labels}\nBy @${issue.user}`;
}

export function formatIssueList(issues: IssueInfo[]): string {
  if (issues.length === 0) return "No issues found.";
  return issues.map(formatIssue).join("\n\n");
}

export function formatPrSummary(pr: PrInfo): string {
  const stateEmoji = pr.state === "open" ? "🟢" : "🟣";
  return (
    `${stateEmoji} *#${pr.number}* ${pr.title}\n` +
    `By @${pr.user} | ${pr.base} ← ${pr.head}`
  );
}

export function formatPrList(prs: PrInfo[]): string {
  if (prs.length === 0) return "No pull requests found.";
  return prs.map(formatPrSummary).join("\n\n");
}

export function formatBranchList(branches: BranchInfo[]): string {
  if (branches.length === 0) return "No branches found.";
  return branches
    .map((b) => {
      const lock = b.protected ? " 🔒" : "";
      return `🌿 ${b.name}${lock}`;
    })
    .join("\n");
}
