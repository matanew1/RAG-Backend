// modules/rag/rag.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmService } from '../llm/llm.service';
import { VectorDbService } from '../vectordb/vectordb.service';
import { RedisService } from '../redis/redis.service';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { ChatHistory, Document as DocumentEntity } from '../database/entities';
import { VectorSearchResult } from '../vectordb/interfaces/vector/vector.interface';
import { v4 as uuidv4 } from 'uuid';

interface ChatSession {
  id: string;
  instructions: string;
  history: Array<{ role: string; content: string }>;
  createdAt: Date;
  lastActivity: Date;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private sessions = new Map<string, ChatSession>();
  private globalInstructions: string;
  private queryCache = new Map<string, { variations: string[]; timestamp: number }>();
  private responseCache = new Map<
    string,
    { response: string; context: string[]; timestamp: number }
  >();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private hasDataCache: { hasData: boolean; timestamp: number } | null = null;
  private readonly HAS_DATA_CACHE_TTL = 30 * 1000; // 30 seconds

  // Pre-cached config values for speed
  private readonly topK: number;
  private readonly temperature: number;

  constructor(
    private configService: ConfigService,
    private vectorDbService: VectorDbService,
    private llmService: LlmService,
    private redisService: RedisService,
    private elasticsearchService: ElasticsearchService,
    @InjectRepository(ChatHistory)
    private chatHistoryRepository: Repository<ChatHistory>,
    @InjectRepository(DocumentEntity)
    private documentRepository: Repository<DocumentEntity>,
  ) {
    this.globalInstructions = this.configService.get<string>('rag.defaultInstructions')!;
    // Pre-cache config values
    this.topK = this.configService.get<number>('rag.topK') || 5;
    this.temperature = this.configService.get<number>('rag.temperature') || 0.7;
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
   * Train the RAG model with new data (Pinecone + Elasticsearch + PostgreSQL)
   */
  async trainWithData(content: string, metadata?: Record<string, any>): Promise<void> {
    try {
      const docId = uuidv4();

      // Generate embedding
      const embedding = await this.llmService.generateEmbedding(content);

      // Store in all three databases in parallel
      await Promise.all([
        this.vectorDbService.upsertDocument({
          id: docId,
          content,
          embedding,
          metadata,
        }),
        this.elasticsearchService.indexDocument(docId, content, metadata),
        this.documentRepository.save({
          id: docId,
          content,
          metadata,
          embeddingId: docId,
          source: metadata?.source || 'api',
          indexedAt: new Date(),
        }),
      ]);

      this.logger.log('✅ Training data added (Pinecone + Elasticsearch + PostgreSQL)');
    } catch (error) {
      this.logger.error('Training failed:', error);
      throw error;
    }
  }

  /**
   * Train with multiple documents - optimized for speed (Pinecone + Elasticsearch + PostgreSQL)
   */
  async trainBatch(
    documents: Array<{ content: string; metadata?: Record<string, any> }>,
  ): Promise<void> {
    try {
      // Parallel embedding generation
      const embeddingPromises = documents.map((doc) =>
        this.llmService.generateEmbedding(doc.content),
      );

      const embeddings = await Promise.all(embeddingPromises);

      const vectorDocs = documents.map((doc, index) => ({
        id: uuidv4(),
        content: doc.content,
        embedding: embeddings[index],
        metadata: doc.metadata,
      }));

      // Batch upsert to all three databases in parallel
      await Promise.all([
        this.vectorDbService.upsertDocuments(vectorDocs),
        this.elasticsearchService.bulkIndex(
          vectorDocs.map((doc) => ({
            id: doc.id,
            content: doc.content,
            metadata: doc.metadata,
          })),
        ),
        this.documentRepository.save(
          vectorDocs.map((doc) => ({
            id: doc.id,
            content: doc.content,
            metadata: doc.metadata,
            embeddingId: doc.id,
            source: doc.metadata?.source || 'batch-api',
            indexedAt: new Date(),
          })),
        ),
      ]);

      this.logger.log(
        `✅ Batch training completed (Pinecone + Elasticsearch + PostgreSQL): ${documents.length} documents`,
      );
    } catch (error) {
      this.logger.error('Batch training failed:', error);
      throw error;
    }
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

    await this.redisService.set(`session:${sessionId}`, session, 3600); // 1 hour TTL

    // Keep in-memory cache for performance
    this.sessions.set(sessionId, session);

    this.logger.log(`🆕 Session created (Redis): ${sessionId}`);
    return sessionId;
  }

  /**
   * Get or create session (Redis-backed with local cache)
   */
  private async getOrCreateSession(sessionId?: string): Promise<ChatSession> {
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
   * Process a chat message with RAG - optimized for speed with hybrid search
   */
  async chat(message: string, sessionId?: string): Promise<string> {
    const session = await this.getOrCreateSession(sessionId);

    try {
      // Check response cache first
      const cacheKey = this.generateCacheKey(message, session.instructions);
      const cached = this.responseCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.logger.log('⚡ Using cached response');
        session.history.push({ role: 'user', content: message });
        session.history.push({ role: 'assistant', content: cached.response });
        await this.persistSession(session);
        return cached.response;
      }

      // Fast path: Skip hybrid search if no training data exists
      let allRelevantDocs: VectorSearchResult[] = [];

      // Quick check if we have any indexed documents (cache this check)
      const hasIndexedData = await this.hasIndexedDocuments();

      if (hasIndexedData) {
        // 1. Get query variations (cached)
        const queryVariations = await this.getCachedQueryVariations(message);

        // 2. Hybrid retrieval: Parallel search in Pinecone + Elasticsearch
        const [vectorDocs, elasticsearchDocs] = await Promise.all([
          this.parallelMultiQueryRetrieval(queryVariations),
          this.elasticsearchService.search(message, this.configService.get<number>('rag.topK')),
        ]);

        // 3. Merge results from both sources (convert Elasticsearch results to VectorSearchResult format)
        const esDocsConverted: VectorSearchResult[] = elasticsearchDocs.map((doc) => ({
          id: doc.id,
          content: doc.content,
          score: doc.score,
          metadata: doc.metadata,
        }));

        allRelevantDocs = [...vectorDocs, ...esDocsConverted];
        this.logger.log(
          `🔍 Hybrid search: ${vectorDocs.length} vector + ${esDocsConverted.length} elastic results`,
        );
      } else {
        this.logger.log('⚡ Skipping search - no indexed documents');
      }

      // 4. Fast deduplication and ranking
      const relevantDocs = this.fastDeduplicateAndRerank(allRelevantDocs, message);

      // 5. Build context
      const context = this.buildContext(relevantDocs);

      // 6. Add user message to history
      session.history.push({ role: 'user', content: message });

      // 7. Build messages (limit history for speed)
      const messages = this.buildOptimizedConversationMessages(session, context);

      // 8. Generate response
      const systemPrompt = this.buildSystemPrompt(session.instructions, context);
      const response = await this.llmService.generateResponse(
        messages,
        systemPrompt,
        this.configService.get<number>('rag.temperature'),
      );

      // 9. Cache the response
      this.responseCache.set(cacheKey, {
        response,
        context: relevantDocs.map((d) => d.content),
        timestamp: Date.now(),
      });

      // 10. Add assistant response to history
      session.history.push({ role: 'assistant', content: response });

      // 11-12. Persist to Redis and PostgreSQL in parallel (non-blocking for response)
      Promise.all([
        this.persistSession(session),
        this.persistChatHistoryToDb(
          session.id,
          message,
          response,
          relevantDocs.map((d) => d.content),
        ),
      ]).catch((err) => this.logger.error('Persistence error:', err));

      // 13. Cleanup old cache entries (non-blocking)
      setTimeout(() => this.cleanupCache(), 0);

      this.logger.log(`💬 Chat response generated for session: ${session.id}`);
      return response;
    } catch (error) {
      this.logger.error('Chat failed:', error);
      throw error;
    }
  }

  /**
   * Stream chat response - optimized for fastest time-to-first-byte
   */
  async *chatStream(message: string, sessionId?: string): AsyncGenerator<string> {
    // Start session lookup immediately (fast from local cache)
    const session = await this.getOrCreateSession(sessionId);

    try {
      // Check cache first (for streaming, we can still use cached responses)
      const cacheKey = this.generateCacheKey(message, session.instructions);
      const cached = this.responseCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.logger.log('⚡ Streaming cached response');
        session.history.push({ role: 'user', content: message });
        session.history.push({ role: 'assistant', content: cached.response });
        session.lastActivity = new Date();

        // Persist session to Redis (non-blocking)
        this.persistSession(session).catch(() => {});

        // Stream cached response in larger chunks for speed
        const chunkSize = 50; // characters per chunk
        for (let i = 0; i < cached.response.length; i += chunkSize) {
          yield cached.response.slice(i, i + chunkSize);
        }
        return;
      }

      // Add user message to history immediately
      session.history.push({ role: 'user', content: message });

      // Build messages BEFORE searching - we can start LLM sooner
      const messages = this.buildOptimizedConversationMessages(session, '');

      // Fast path: If no indexed data, skip search entirely and start streaming immediately
      const hasIndexedData = await this.hasIndexedDocuments();

      let relevantDocs: VectorSearchResult[] = [];
      let context = '';
      let systemPrompt = this.buildSystemPrompt(session.instructions, '');

      if (hasIndexedData) {
        // Hybrid search: parallel Pinecone + Elasticsearch
        const [vectorDocs, elasticsearchDocs] = await Promise.all([
          this.vectorDbService.search(await this.llmService.generateEmbedding(message), this.topK),
          this.elasticsearchService.search(message, this.topK),
        ]);

        // Merge and deduplicate results
        const allRelevantDocs = [
          ...vectorDocs,
          ...elasticsearchDocs.map((doc) => ({
            id: doc.id,
            content: doc.content,
            metadata: doc.metadata,
            score: doc.score || 0,
          })),
        ];
        relevantDocs = this.fastDeduplicateAndRerank(allRelevantDocs, message);
        context = this.buildContext(relevantDocs);

        // Rebuild with context
        systemPrompt = this.buildSystemPrompt(session.instructions, context);
      }

      // Stream response - this is where the Cohere API latency happens
      let fullResponse = '';
      const stream = this.llmService.generateStreamingResponse(
        messages,
        systemPrompt,
        this.temperature,
      );

      for await (const chunk of stream) {
        fullResponse += chunk;
        yield chunk;
      }

      // Cache the complete response (non-blocking)
      this.responseCache.set(cacheKey, {
        response: fullResponse,
        context: relevantDocs.map((d) => d.content),
        timestamp: Date.now(),
      });

      // Save complete response to history
      session.history.push({ role: 'assistant', content: fullResponse });
      session.lastActivity = new Date();

      // Persist to Redis and PostgreSQL in parallel (non-blocking - fire and forget)
      Promise.all([
        this.persistSession(session),
        this.persistChatHistoryToDb(
          session.id,
          message,
          fullResponse,
          relevantDocs.map((d) => d.content),
        ),
      ]).catch((err) => this.logger.error('Persistence error:', err));

      // Cleanup (non-blocking)
      setTimeout(() => this.cleanupCache(), 0);
    } catch (error) {
      this.logger.error('Streaming chat failed:', error);
      throw error;
    }
  }

  /**
   * Clear session history (Redis-backed)
   */
  async clearSession(sessionId: string): Promise<void> {
    const session = await this.redisService.get<ChatSession>(`session:${sessionId}`);
    if (session) {
      session.history = [];
      await this.redisService.set(`session:${sessionId}`, session, 3600);

      // Update local cache
      if (this.sessions.has(sessionId)) {
        this.sessions.get(sessionId)!.history = [];
      }

      this.logger.log(`🗑️  Session cleared (Redis): ${sessionId}`);
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
  private async persistSession(session: ChatSession): Promise<void> {
    await this.redisService.set(`session:${session.id}`, session, 3600);
    this.sessions.set(session.id, session); // Update local cache
  }

  /**
   * Persist chat history to PostgreSQL
   */
  private async persistChatHistoryToDb(
    sessionId: string,
    userMessage: string,
    assistantResponse: string,
    context: string[],
  ): Promise<void> {
    try {
      // Save user message
      await this.chatHistoryRepository.save({
        sessionId,
        role: 'user',
        content: userMessage,
        metadata: { timestamp: new Date() },
      });

      // Save assistant response
      await this.chatHistoryRepository.save({
        sessionId,
        role: 'assistant',
        content: assistantResponse,
        context,
        metadata: { timestamp: new Date() },
      });

      this.logger.log(`💾 Chat history persisted to DB for session: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to persist chat history to DB: ${error.message}`);
      // Don't throw - chat should work even if DB persistence fails
    }
  }

  /**
   * Generate cache key for responses
   */
  private generateCacheKey(message: string, instructions: string): string {
    return `${instructions.slice(0, 50)}|${message.slice(0, 100)}`.toLowerCase();
  }

  /**
   * Get cached query variations or generate new ones
   */
  private async getCachedQueryVariations(query: string): Promise<string[]> {
    const cacheKey = query.slice(0, 50).toLowerCase();
    const cached = this.queryCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.variations;
    }

    const variations = await this.generateQueryVariations(query);
    this.queryCache.set(cacheKey, { variations, timestamp: Date.now() });
    return variations;
  }

  /**
   * Generate multiple query variations for better retrieval
   */
  private async generateQueryVariations(query: string): Promise<string[]> {
    try {
      const variations = [query]; // Always include original

      // Generate 2-3 variations using LLM
      const prompt = `Generate 3 different but semantically similar search queries for: "${query}"
Return only the queries, one per line, no numbering or extra text.`;

      const response = await this.llmService.generateResponse(
        [{ role: 'user', content: prompt }],
        undefined,
        0.3, // Low temperature for consistency
      );

      const additionalVariations = response
        .split('\n')
        .map((v) => v.trim())
        .filter((v) => v.length > 0 && v !== query)
        .slice(0, 3);

      variations.push(...additionalVariations);
      return variations;
    } catch (error) {
      this.logger.warn('Query variation generation failed, using original query');
      return [query];
    }
  }

  /**
   * Parallel multi-query retrieval for speed
   */
  private async parallelMultiQueryRetrieval(queries: string[]): Promise<VectorSearchResult[]> {
    const topK = Math.ceil(this.configService.get<number>('rag.topK')! / queries.length);

    // Parallel embedding generation and search
    const searchPromises = queries.map(async (query) => {
      try {
        const embedding = await this.llmService.generateEmbedding(query);
        return this.vectorDbService.search(embedding, topK);
      } catch (error) {
        this.logger.warn(`Query failed: ${query}`, error);
        return [];
      }
    });

    const results = await Promise.all(searchPromises);
    return results.flat();
  }

  /**
   * Fast deduplication and reranking
   */
  private fastDeduplicateAndRerank(
    docs: VectorSearchResult[],
    originalQuery: string,
  ): VectorSearchResult[] {
    const uniqueDocs = new Map<string, VectorSearchResult>();
    const queryWords = originalQuery.toLowerCase().split(/\s+/);

    for (const doc of docs) {
      const key = this.getContentHash(doc.content);
      const existing = uniqueDocs.get(key);

      // Prefer docs with higher score or better keyword match
      const keywordScore = this.calculateKeywordScore(doc.content, queryWords);
      const totalScore = (doc.score || 0) + keywordScore;

      if (
        !existing ||
        (existing.score || 0) + this.calculateKeywordScore(existing.content, queryWords) <
          totalScore
      ) {
        uniqueDocs.set(key, { ...doc, score: totalScore });
      }
    }

    return Array.from(uniqueDocs.values())
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, this.configService.get<number>('rag.topK'));
  }

  /**
   * Calculate keyword matching score
   */
  private calculateKeywordScore(content: string, queryWords: string[]): number {
    const contentLower = content.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) score += 0.1;
    }
    return score;
  }

  /**
   * Build optimized conversation messages with limited history
   */
  private buildOptimizedConversationMessages(
    session: ChatSession,
    context: string,
  ): Array<{ role: string; content: string }> {
    // Limit history to last 6 messages for speed
    const recentHistory = session.history.slice(-6);
    return [{ role: 'system', content: `${session.instructions}${context}` }, ...recentHistory];
  }

  /**
   * Build formatted context from documents
   */
  private buildContext(docs: VectorSearchResult[]): string {
    if (docs.length === 0) return '';
    return `\n\nRelevant information:\n${docs.map((doc, idx) => `[${idx + 1}] ${doc.content}`).join('\n\n')}`;
  }

  /**
   * Build system prompt with instructions and context
   */
  private buildSystemPrompt(instructions: string, context: string): string {
    return `${instructions}${context}`;
  }

  /**
   * Simple content hash for deduplication
   */
  private getContentHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString();
  }

  /**
   * Check if we have any indexed documents (cached for performance)
   */
  private async hasIndexedDocuments(): Promise<boolean> {
    const now = Date.now();

    // Return cached value if fresh
    if (this.hasDataCache && now - this.hasDataCache.timestamp < this.HAS_DATA_CACHE_TTL) {
      return this.hasDataCache.hasData;
    }

    // Quick count query - just check if any documents exist
    const count = await this.documentRepository.count({ take: 1 });
    const hasData = count > 0;

    // Cache the result
    this.hasDataCache = { hasData, timestamp: now };

    return hasData;
  }

  /**
   * Cleanup old cache entries and manage memory
   */
  private cleanupCache(): void {
    const now = Date.now();

    // Cleanup query cache
    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.queryCache.delete(key);
      }
    }

    // Cleanup response cache
    for (const [key, value] of this.responseCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.responseCache.delete(key);
      }
    }

    // Cleanup old sessions (older than 1 hour)
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < oneHourAgo) {
        this.sessions.delete(sessionId);
      }
    }

    // Limit cache sizes
    if (this.queryCache.size > 1000) {
      const entries = Array.from(this.queryCache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      this.queryCache = new Map(entries.slice(0, 500));
    }

    if (this.responseCache.size > 1000) {
      const entries = Array.from(this.responseCache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      this.responseCache = new Map(entries.slice(0, 500));
    }
  }
}
