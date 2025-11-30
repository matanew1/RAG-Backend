// modules/rag/rag.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';
import { VectorDbService } from '../vectordb/vectordb.service';
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
  private readonly MAX_SESSIONS = 1000; // Limit concurrent sessions

  constructor(
    private configService: ConfigService,
    private vectorDbService: VectorDbService,
    private llmService: LlmService,
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
   * Train the RAG model with new data
   */
  async trainWithData(content: string, metadata?: Record<string, any>): Promise<void> {
    try {
      // Generate embedding
      const embedding = await this.llmService.generateEmbedding(content);

      // Store in vector database
      await this.vectorDbService.upsertDocument({
        id: uuidv4(),
        content,
        embedding,
        metadata,
      });

      this.logger.log('✅ Training data added');
    } catch (error) {
      this.logger.error('Training failed:', error);
      throw error;
    }
  }

  /**
   * Train with multiple documents - optimized for speed
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

      // Batch upsert to vector database
      await this.vectorDbService.upsertDocuments(vectorDocs);

      this.logger.log(`✅ Batch training completed: ${documents.length} documents`);
    } catch (error) {
      this.logger.error('Batch training failed:', error);
      throw error;
    }
  }

  /**
   * Create a new chat session
   */
  createSession(): string {
    const sessionId = uuidv4();

    this.sessions.set(sessionId, {
      id: sessionId,
      instructions: this.globalInstructions,
      history: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    });

    this.logger.log(`🆕 Session created: ${sessionId}`);
    return sessionId;
  }

  /**
   * Get or create session
   */
  private getOrCreateSession(sessionId?: string): ChatSession {
    if (!sessionId || !this.sessions.has(sessionId)) {
      const newSessionId = this.createSession();
      return this.sessions.get(newSessionId)!;
    }

    const session = this.sessions.get(sessionId)!;
    session.lastActivity = new Date();
    return session;
  }

  /**
   * Process a chat message with RAG - optimized for speed
   */
  async chat(message: string, sessionId?: string): Promise<string> {
    const session = this.getOrCreateSession(sessionId);

    try {
      // Check response cache first
      const cacheKey = this.generateCacheKey(message, session.instructions);
      const cached = this.responseCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.logger.log('⚡ Using cached response');
        session.history.push({ role: 'user', content: message });
        session.history.push({ role: 'assistant', content: cached.response });
        return cached.response;
      }

      // 1. Get query variations (cached)
      const queryVariations = await this.getCachedQueryVariations(message);

      // 2. Parallel retrieval for all variations
      const allRelevantDocs = await this.parallelMultiQueryRetrieval(queryVariations);

      // 3. Fast deduplication and ranking
      const relevantDocs = this.fastDeduplicateAndRerank(allRelevantDocs, message);

      // 4. Build context
      const context = this.buildContext(relevantDocs);

      // 5. Add user message to history
      session.history.push({ role: 'user', content: message });

      // 6. Build messages (limit history for speed)
      const messages = this.buildOptimizedConversationMessages(session, context);

      // 7. Generate response
      const systemPrompt = this.buildSystemPrompt(session.instructions, context);
      const response = await this.llmService.generateResponse(
        messages,
        systemPrompt,
        this.configService.get<number>('rag.temperature'),
      );

      // 8. Cache the response
      this.responseCache.set(cacheKey, {
        response,
        context: relevantDocs.map((d) => d.content),
        timestamp: Date.now(),
      });

      // 9. Add assistant response to history
      session.history.push({ role: 'assistant', content: response });

      // 10. Cleanup old cache entries
      this.cleanupCache();

      this.logger.log(`💬 Chat response generated for session: ${session.id}`);
      return response;
    } catch (error) {
      this.logger.error('Chat failed:', error);
      throw error;
    }
  }

  /**
   * Stream chat response - optimized for speed
   */
  async *chatStream(message: string, sessionId?: string): AsyncGenerator<string> {
    const session = this.getOrCreateSession(sessionId);

    try {
      // Check cache first (for streaming, we can still use cached responses)
      const cacheKey = this.generateCacheKey(message, session.instructions);
      const cached = this.responseCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.logger.log('⚡ Streaming cached response');
        session.history.push({ role: 'user', content: message });
        session.history.push({ role: 'assistant', content: cached.response });

        // Stream cached response in chunks
        const words = cached.response.split(' ');
        for (const word of words) {
          yield word + ' ';
          await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay for streaming effect
        }
        return;
      }

      // Use optimized retrieval
      const queryVariations = await this.getCachedQueryVariations(message);
      const allRelevantDocs = await this.parallelMultiQueryRetrieval(queryVariations);
      const relevantDocs = this.fastDeduplicateAndRerank(allRelevantDocs, message);
      const context = this.buildContext(relevantDocs);

      // Update history
      session.history.push({ role: 'user', content: message });

      const messages = this.buildOptimizedConversationMessages(session, context);
      const systemPrompt = this.buildSystemPrompt(session.instructions, context);

      // Stream response
      let fullResponse = '';
      const stream = this.llmService.generateStreamingResponse(
        messages,
        systemPrompt,
        this.configService.get<number>('rag.temperature'),
      );

      for await (const chunk of stream) {
        fullResponse += chunk;
        yield chunk;
      }

      // Cache the complete response
      this.responseCache.set(cacheKey, {
        response: fullResponse,
        context: relevantDocs.map((d) => d.content),
        timestamp: Date.now(),
      });

      // Save complete response to history
      session.history.push({ role: 'assistant', content: fullResponse });

      // Cleanup
      this.cleanupCache();
    } catch (error) {
      this.logger.error('Streaming chat failed:', error);
      throw error;
    }
  }

  /**
   * Clear session history
   */
  clearSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.history = [];
      this.logger.log(`🗑️  Session cleared: ${sessionId}`);
    }
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.logger.log(`❌ Session deleted: ${sessionId}`);
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      messageCount: session.history.length,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    };
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
      .slice(0, this.configService.get<number>('rag.topK')!);
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
   * Retrieve documents using multiple queries
   */
  private async multiQueryRetrieval(queries: string[]): Promise<VectorSearchResult[]> {
    const topK = Math.ceil(this.configService.get<number>('rag.topK')! / queries.length);
    const allResults: VectorSearchResult[] = [];

    for (const query of queries) {
      try {
        const embedding = await this.llmService.generateEmbedding(query);
        const results = await this.vectorDbService.search(embedding, topK);
        allResults.push(...results);
      } catch (error) {
        this.logger.warn(`Query failed: ${query}`, error);
      }
    }

    return allResults;
  }

  /**
   * Remove duplicates and rerank results
   */
  private deduplicateAndRerank(
    docs: VectorSearchResult[],
    originalQuery: string,
  ): VectorSearchResult[] {
    // Remove duplicates based on content similarity
    const uniqueDocs = new Map<string, VectorSearchResult>();

    for (const doc of docs) {
      const key = this.getContentHash(doc.content);
      if (!uniqueDocs.has(key) || (uniqueDocs.get(key)!.score || 0) < (doc.score || 0)) {
        uniqueDocs.set(key, doc);
      }
    }

    // Rerank by relevance to original query
    const docsArray = Array.from(uniqueDocs.values());
    docsArray.sort((a, b) => (b.score || 0) - (a.score || 0));

    return docsArray.slice(0, this.configService.get<number>('rag.topK')!);
  }

  /**
   * Build better formatted context
   */
  private buildContext(docs: VectorSearchResult[]): string {
    if (docs.length === 0) return '';

    return `\n\nRelevant information:\n${docs
      .map((doc, idx) => `[${idx + 1}] ${doc.content}`)
      .join('\n\n')}`;
  }

  /**
   * Build conversation messages with better structure
   */
  private buildConversationMessages(
    session: ChatSession,
    context: string,
  ): Array<{ role: string; content: string }> {
    const recentHistory = session.history.slice(-8); // Keep more context
    return [{ role: 'system', content: `${session.instructions}${context}` }, ...recentHistory];
  }

  /**
   * Build improved system prompt
   */
  private buildSystemPrompt(instructions: string, context: string): string {
    return `${instructions}

When answering:
- Use the provided context to give accurate, specific information
- If context doesn't contain relevant information, say so clearly
- Cite sources when using specific facts from the context
- Be concise but comprehensive
- Ask for clarification if the question is ambiguous

${context}`;
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
   * Search with metadata filtering
   */
  async searchWithFilter(
    query: string,
    filter?: Record<string, any>,
    topK?: number,
  ): Promise<VectorSearchResult[]> {
    const embedding = await this.llmService.generateEmbedding(query);
    const k = topK || this.configService.get<number>('rag.topK')!;
    return this.vectorDbService.search(embedding, k, filter);
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

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      activeSessions: this.sessions.size,
      queryCacheSize: this.queryCache.size,
      responseCacheSize: this.responseCache.size,
      totalSessionsCreated: this.sessions.size, // Could track this separately
    };
  }
}
