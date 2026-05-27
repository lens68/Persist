import type { CreateMessageInput, Message } from '../types/message.js';
import type {
  CreateSessionInput,
  Session,
  SessionReplay,
  SessionWithMessages,
} from '../types/session.js';

/**
 * Persistence port — interface defined in shared, implemented in storage.
 * All runtime actions are persistence-aware through this port.
 */
export interface SessionStore {
  createSession(input: CreateSessionInput): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  getSessionWithMessages(id: string): Promise<SessionWithMessages | null>;

  appendMessage(sessionId: string, input: CreateMessageInput): Promise<Message>;
  updateMessage(
    sessionId: string,
    messageId: string,
    patch: Partial<
      Pick<Message, 'content' | 'providerMetadata' | 'completionState' | 'completedAt'>
    >,
  ): Promise<Message>;

  getReplay(sessionId: string): Promise<SessionReplay | null>;
}
