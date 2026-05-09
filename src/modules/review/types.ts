export interface ReviewResult {
  summary: string;
  issues: Array<{
    severity: "critical" | "warning" | "suggestion";
    file: string;
    line?: number;
    description: string;
  }>;
  approved: boolean;
}
