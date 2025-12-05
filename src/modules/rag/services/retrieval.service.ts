// modules/rag/services/retrieval.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../llm/llm.service';
import { VectorDbService } from '../../vectordb/vectordb.service';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import { VectorSearchResult } from '../../vectordb/interfaces/vector/vector.interface';

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private queryCache = new Map<string, { variations: string[]; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly topK: number;

  constructor(
    private configService: ConfigService,
    private vectorDbService: VectorDbService,
    private llmService: LlmService,
    private elasticsearchService: ElasticsearchService,
  ) {
    this.topK = this.configService.get<number>('rag.topK') || 5;
  }

  /**
   * Hybrid search: Pinecone (semantic) + Elasticsearch (keyword)
   */
  async hybridSearch(query: string): Promise<VectorSearchResult[]> {
    const [vectorDocs, elasticsearchDocs] = await Promise.all([
      this.semanticSearch(query),
      this.keywordSearch(query),
    ]);

    // Merge results
    const allDocs: VectorSearchResult[] = [
      ...vectorDocs,
      ...elasticsearchDocs.map((doc) => ({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        score: doc.score || 0,
      })),
    ];

    this.logger.log(
      `🔍 Hybrid search: ${vectorDocs.length} vector + ${elasticsearchDocs.length} elastic results`,
    );

    return this.deduplicateAndRerank(allDocs, query);
  }

  /**
   * Semantic search using Pinecone
   */
  async semanticSearch(query: string): Promise<VectorSearchResult[]> {
    const embedding = await this.llmService.generateEmbedding(query);
    return this.vectorDbService.search(embedding, this.topK);
  }

  /**
   * Keyword search using Elasticsearch
   */
  async keywordSearch(query: string): Promise<any[]> {
    return this.elasticsearchService.search(query, this.topK);
  }

  /**
   * Multi-query retrieval with cached variations
   */
  async multiQueryRetrieval(query: string): Promise<VectorSearchResult[]> {
    const queryVariations = await this.getCachedQueryVariations(query);
    return this.parallelMultiQueryRetrieval(queryVariations);
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
    const topK = Math.ceil(this.topK / queries.length);

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
  deduplicateAndRerank(docs: VectorSearchResult[], originalQuery: string): VectorSearchResult[] {
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
      .slice(0, this.topK);
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
   * Build formatted context from documents
   */
  buildContext(docs: VectorSearchResult[]): string {
    if (docs.length === 0) return '';
    return `\n\nRelevant information:\n${docs.map((doc, idx) => `[${idx + 1}] ${doc.content}`).join('\n\n')}`;
  }

  /**
   * Cleanup old cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.queryCache.delete(key);
      }
    }

    // Limit cache size
    if (this.queryCache.size > 1000) {
      const entries = Array.from(this.queryCache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      this.queryCache = new Map(entries.slice(0, 500));
    }
  }
}
