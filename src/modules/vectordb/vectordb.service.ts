// modules/vectordb/vectordb.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { VectorDocument, VectorSearchResult } from './interfaces/vector/vector.interface';
import { PineconeService } from '../pinecone/pinecone.service';

@Injectable()
export class VectorDbService {
  private readonly logger = new Logger(VectorDbService.name);
  private index: any;

  constructor(private pineconeService: PineconeService) {
    this.initializeIndex();
  }

  private initializeIndex() {
    try {
      const pinecone = this.pineconeService.getClient();
      const indexName = this.pineconeService.getIndexName();
      this.index = pinecone.index(indexName);

      this.logger.log('✅ Vector database initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize vector database:', error);
      throw error;
    }
  }

  /**
   * Store a document in the vector database
   */
  async upsertDocument(doc: VectorDocument): Promise<void> {
    try {
      await this.index.upsert([
        {
          id: doc.id,
          values: doc.embedding,
          metadata: {
            content: doc.content,
            ...doc.metadata,
          },
        },
      ]);

      this.logger.log(`📝 Document stored: ${doc.id}`);
    } catch (error) {
      this.logger.error('Failed to upsert document:', error);
      throw error;
    }
  }

  /**
   * Store multiple documents in batch
   */
  async upsertDocuments(docs: VectorDocument[]): Promise<void> {
    try {
      const vectors = docs.map((doc) => ({
        id: doc.id,
        values: doc.embedding,
        metadata: {
          content: doc.content,
          ...doc.metadata,
        },
      }));

      await this.index.upsert(vectors);

      this.logger.log(`📚 Batch stored: ${docs.length} documents`);
    } catch (error) {
      this.logger.error('Failed to batch upsert:', error);
      throw error;
    }
  }

  /**
   * Search for similar documents with metadata filtering
   */
  async search(
    queryEmbedding: number[],
    topK: number = 5,
    filter?: Record<string, any>,
  ): Promise<VectorSearchResult[]> {
    try {
      const queryOptions: any = {
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
      };

      if (filter) {
        queryOptions.filter = filter;
      }

      const results = await this.index.query(queryOptions);

      return results.matches.map((match) => ({
        id: match.id,
        content: match.metadata?.content || '',
        score: match.score || 0,
        metadata: match.metadata,
      }));
    } catch (error) {
      this.logger.error('Search failed:', error);
      throw error;
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<void> {
    try {
      await this.index.deleteOne(id);
      this.logger.log(`🗑️  Document deleted: ${id}`);
    } catch (error) {
      this.logger.error('Delete failed:', error);
      throw error;
    }
  }

  /**
   * Clear all documents (use with caution!)
   */
  async clearAll(): Promise<void> {
    try {
      await this.index.deleteAll();
      this.logger.warn('⚠️  All documents cleared');
    } catch (error) {
      this.logger.error('Clear all failed:', error);
      throw error;
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<any> {
    try {
      const stats = await this.index.describeIndexStats();
      return {
        totalVectors: stats.totalVectorCount || 0,
        dimension: stats.dimension || 0,
        indexFullness: stats.indexFullness || 0,
        namespaces: stats.namespaces || {},
      };
    } catch (error) {
      this.logger.error('Failed to get index stats:', error);
      throw error;
    }
  }

  /**
   * Get index information
   */
  async getIndexInfo(): Promise<any> {
    try {
      const pinecone = this.pineconeService.getClient();
      const indexName = this.pineconeService.getIndexName();
      const indexList = await pinecone.listIndexes();
      const indexInfo = indexList.indexes?.find((idx) => idx.name === indexName);

      if (!indexInfo) {
        throw new Error(`Index ${indexName} not found`);
      }

      return {
        name: indexInfo.name,
        dimension: indexInfo.dimension,
        metric: indexInfo.metric,
        host: indexInfo.host,
        status:
          typeof indexInfo.status === 'object'
            ? indexInfo.status?.ready
              ? 'Ready'
              : 'Not Ready'
            : indexInfo.status || 'Unknown',
        createdAt: (indexInfo as any).createdAt
          ? new Date((indexInfo as any).createdAt).toISOString()
          : 'Not available',
      };
    } catch (error) {
      this.logger.error('Failed to get index info:', error);
      throw error;
    }
  }

  /**
   * List all documents (with pagination) - Note: scores are not meaningful when using empty vector
   */
  async listDocuments(limit: number = 100, offset: number = 0): Promise<any[]> {
    try {
      // Pinecone doesn't have a direct list method, so we'll use query with empty vector
      // This is a workaround - scores will be 0.0 since we're using a zero vector
      // In a production system, you'd want to store document IDs separately for proper listing
      // Using 384 dimensions to match sentence-transformers/all-MiniLM-L6-v2
      const emptyVector = new Array(384).fill(0);
      const results = await this.index.query({
        vector: emptyVector,
        topK: Math.min(limit + offset, 1000), // Pinecone max is 1000
        includeMetadata: true,
      });

      // Skip the offset and take only the requested limit
      const documents = (results.matches || []).slice(offset, offset + limit).map((match) => ({
        id: match.id,
        content: match.metadata?.content || '',
        metadata: match.metadata,
        score: 0.0, // Meaningless score when using empty vector - always 0
        note: 'Score not applicable for document listing',
      }));

      return documents;
    } catch (error) {
      this.logger.error('Failed to list documents:', error);
      throw error;
    }
  }
}
