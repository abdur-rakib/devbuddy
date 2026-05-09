export interface FileChange {
  action: "create" | "modify" | "delete";
  path: string;
  content?: string;
}

export interface CodeGenResult {
  summary: string;
  files: FileChange[];
  commitMessage: string;
}

export interface CodeGenJob {
  id: string;
  user_id: number;
  repo_id: number;
  description: string;
  status: string;
  branch_name: string | null;
  pr_url: string | null;
  workspace_path: string | null;
  created_at: string;
}
