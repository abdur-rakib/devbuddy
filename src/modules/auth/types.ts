import type { Context, SessionFlavor } from "grammy";

export interface UserRecord {
  id: number;
  telegram_id: number;
  telegram_username: string | null;
  github_token_enc: string;
  copilot_token_enc: string;
  active_repo_id: number | null;
  created_at: string;
}

export interface SessionData {
  onboardingStep?: "awaiting_token" | "awaiting_copilot_token";
  chatSessionId?: string;
  codegenJobId?: string;
  codegenAwaitingDescription?: boolean;
  codegenAwaitingRevision?: boolean;
}

export type BotContext = Context &
  SessionFlavor<SessionData> & {
    user?: UserRecord;
  };
