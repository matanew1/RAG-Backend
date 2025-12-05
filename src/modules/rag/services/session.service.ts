// modules/rag/services/session.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

export interface ChatSession {
  id: string;
  instructions: string;
  history: Array<{ role: string; content: string }>;
  createdAt: Date;
  lastActivity: Date;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private sessions = new Map<string, ChatSession>();
  private globalInstructions: string;
  private readonly SESSION_TTL = 3600; // 1 hour

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    this.globalInstructions = this.configService.get<string>('rag.defaultInstructions')!;
  }

  /**
   * Update global instructions
   */
  updateInstructions(instructions: string): void {
    this.globalInstructions = instructions;
    this.logger.log('📝 Instructions updated');
  }

  /**
   * Get current instructions
   */
  getInstructions(): string {
    return this.globalInstructions;
  }

  /**
   * Create a new chat session (Redis-backed)
   */
  async createSession(): Promise<string> {
    const sessionId = uuidv4();

    const session: ChatSession = {
      id: sessionId,
      instructions: this.globalInstructions,
      history: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    await this.redisService.set(`session:${sessionId}`, session, this.SESSION_TTL);

    // Keep in-memory cache for performance
    this.sessions.set(sessionId, session);

    this.logger.log(`🆕 Session created (Redis): ${sessionId}`);
    return sessionId;
  }

  /**
   * Get or create session (Redis-backed with local cache)
   */
  async getOrCreateSession(sessionId?: string): Promise<ChatSession> {
    if (!sessionId) {
      const newSessionId = await this.createSession();
      return this.sessions.get(newSessionId)!;
    }

    // Try local cache first
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      session.lastActivity = new Date();
      return session;
    }

    // Try Redis
    const redisSession = await this.redisService.get<ChatSession>(`session:${sessionId}`);
    if (redisSession) {
      // Restore dates from JSON
      redisSession.createdAt = new Date(redisSession.createdAt);
      redisSession.lastActivity = new Date();
      this.sessions.set(sessionId, redisSession);
      this.logger.log(`📦 Session restored from Redis: ${sessionId}`);
      return redisSession;
    }

    // Session not found, create new one
    const newSessionId = await this.createSession();
    return this.sessions.get(newSessionId)!;
  }

  /**
   * Clear session history (Redis-backed)
   */
  async clearSession(sessionId: string): Promise<void> {
    const session = await this.redisService.get<ChatSession>(`session:${sessionId}`);
    if (session) {
      session.history = [];
      await this.redisService.set(`session:${sessionId}`, session, this.SESSION_TTL);

      // Update local cache
      if (this.sessions.has(sessionId)) {
        this.sessions.get(sessionId)!.history = [];
      }

      this.logger.log(`🗑️ Session cleared (Redis): ${sessionId}`);
    }
  }

  /**
   * Delete session (Redis-backed)
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.redisService.del(`session:${sessionId}`);
    this.sessions.delete(sessionId);
    this.logger.log(`❌ Session deleted (Redis): ${sessionId}`);
  }

  /**
   * Get session info (Redis-backed)
   */
  async getSessionInfo(sessionId: string): Promise<any> {
    // Try local cache first
    let session: ChatSession | undefined = this.sessions.get(sessionId);

    // Fallback to Redis
    if (!session) {
      const redisSession = await this.redisService.get<ChatSession>(`session:${sessionId}`);
      if (redisSession) {
        session = redisSession;
        session.createdAt = new Date(session.createdAt);
        session.lastActivity = new Date(session.lastActivity);
      }
    }

    if (!session) return null;

    return {
      id: session.id,
      messageCount: session.history.length,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    };
  }

  /**
   * Persist session to Redis
   */
  async persistSession(session: ChatSession): Promise<void> {
    await this.redisService.set(`session:${session.id}`, session, this.SESSION_TTL);
    this.sessions.set(session.id, session); // Update local cache
  }

  /**
   * Cleanup old sessions from local cache
   */
  cleanupSessions(): void {
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < oneHourAgo) {
        this.sessions.delete(sessionId);
      }
    }
  }
}
