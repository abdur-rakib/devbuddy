export interface RepoInfo {
  full_name: string;
  description: string | null;
}

export interface IssueInfo {
  number: number;
  title: string;
  state: string;
  labels: string[];
  user: string;
}

export interface PrInfo {
  number: number;
  title: string;
  state: string;
  user: string;
  head: string;
  base: string;
}

export interface BranchInfo {
  name: string;
  protected: boolean;
}
