import { Octokit } from "@octokit/rest";
import { decrypt } from "../auth/crypto.js";
import { config } from "../../config.js";
import type { UserRecord } from "../auth/types.js";
import type { RepoInfo, IssueInfo, PrInfo, BranchInfo } from "./types.js";

export function createOctokit(user: UserRecord): Octokit {
  const token = decrypt(user.github_token_enc, config.encryptionKey);
  return new Octokit({ auth: token });
}

export async function listUserRepos(
  octokit: Octokit
): Promise<RepoInfo[]> {
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 100,
  });
  return data.map((r) => ({
    full_name: r.full_name,
    description: r.description,
  }));
}

export async function listIssues(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<IssueInfo[]> {
  const { data } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: "open",
    per_page: 30,
  });
  // Filter out pull requests (GitHub returns PRs in issues endpoint)
  return data
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: i.labels.map((l) =>
        typeof l === "string" ? l : l.name ?? ""
      ),
      user: i.user?.login ?? "unknown",
    }));
}

export async function listPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<PrInfo[]> {
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 30,
  });
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    user: pr.user?.login ?? "unknown",
    head: pr.head.ref,
    base: pr.base.ref,
  }));
}

export async function getPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrInfo> {
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    user: pr.user?.login ?? "unknown",
    head: pr.head.ref,
    base: pr.base.ref,
  };
}

export async function getPrDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });
  return data as unknown as string;
}

export async function listBranches(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<BranchInfo[]> {
  const { data } = await octokit.rest.repos.listBranches({
    owner,
    repo,
    per_page: 30,
  });
  return data.map((b) => ({
    name: b.name,
    protected: b.protected,
  }));
}
