export interface ChatExecutionInput {
  sessionId: string;
  userContent: string;
  model?: string;
  signal?: AbortSignal;
}
