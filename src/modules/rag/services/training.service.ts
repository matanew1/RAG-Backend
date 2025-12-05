// modules/rag/services/training.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmService } from '../../llm/llm.service';
import { VectorDbService } from '../../vectordb/vectordb.service';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import { Document as DocumentEntity } from '../../database/entities';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);
  private hasDataCache: { hasData: boolean; timestamp: number } | null = null;
  private readonly HAS_DATA_CACHE_TTL = 30 * 1000; // 30 seconds

  constructor(
    private vectorDbService: VectorDbService,
    private llmService: LlmService,
    private elasticsearchService: ElasticsearchService,
    @InjectRepository(DocumentEntity)
    private documentRepository: Repository<DocumentEntity>,
  ) {}

  /**
   * Train the RAG model with new data (Pinecone + Elasticsearch + PostgreSQL)
   * Uses Saga pattern for rollback on partial failures
   */
  async trainWithData(content: string, metadata?: Record<string, any>): Promise<void> {
    const docId = uuidv4();

    // Saga pattern: track what succeeded for potential rollback
    const ops = { pinecone: false, elastic: false, postgres: false };

    try {
      // Generate embedding first (no rollback needed)
      const embedding = await this.llmService.generateEmbedding(content);

      // Sequential writes with rollback capability
      await this.vectorDbService.upsertDocument({
        id: docId,
        content,
        embedding,
        metadata,
      });
      ops.pinecone = true;

      await this.elasticsearchService.indexDocument(docId, content, metadata);
      ops.elastic = true;

      await this.documentRepository.save({
        id: docId,
        content,
        metadata,
        embeddingId: docId,
        source: metadata?.source || 'api',
        indexedAt: new Date(),
      });
      ops.postgres = true;

      // Invalidate cache
      this.hasDataCache = null;

      this.logger.log('✅ Training data added (Pinecone + Elasticsearch + PostgreSQL)');
    } catch (error) {
      this.logger.error('Training failed, initiating rollback:', error);

      // Compensating transactions (rollback)
      if (ops.pinecone) {
        await this.vectorDbService
          .deleteDocument(docId)
          .catch((e) => this.logger.error('Rollback failed for Pinecone:', e));
      }
      if (ops.elastic) {
        await this.elasticsearchService
          .deleteDocument(docId)
          .catch((e) => this.logger.error('Rollback failed for Elasticsearch:', e));
      }

      throw error;
    }
  }

  /**
   * Train with multiple documents - optimized batch processing
   */
  async trainBatch(
    documents: Array<{ content: string; metadata?: Record<string, any> }>,
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Process in parallel with controlled concurrency
    const batchSize = 5;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map((doc) => this.trainWithData(doc.content, doc.metadata)),
      );

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          success++;
        } else {
          failed++;
          this.logger.error('Batch item failed:', result.reason);
        }
      });
    }

    // Invalidate cache
    this.hasDataCache = null;

    this.logger.log(`✅ Batch training completed: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Check if we have any indexed documents (cached for performance)
   */
  async hasIndexedDocuments(): Promise<boolean> {
    const now = Date.now();

    // Return cached value if fresh
    if (this.hasDataCache && now - this.hasDataCache.timestamp < this.HAS_DATA_CACHE_TTL) {
      return this.hasDataCache.hasData;
    }

    // Quick count query
    const count = await this.documentRepository.count({ take: 1 });
    const hasData = count > 0;

    // Cache the result
    this.hasDataCache = { hasData, timestamp: now };

    return hasData;
  }
}
