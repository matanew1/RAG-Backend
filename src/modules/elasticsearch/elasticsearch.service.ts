// src/modules/elasticsearch/elasticsearch.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client: Client;
  private readonly indexName = 'rag-documents';

  constructor(private configService: ConfigService) {
    const elasticsearchUrl =
      this.configService.get<string>('ELASTICSEARCH_URL') || 'http://localhost:9200';

    this.client = new Client({
      node: elasticsearchUrl,
      // Connection pool configuration
      maxRetries: 3,
      requestTimeout: 30000,
      sniffOnStart: false,
    });
  }

  async onModuleInit() {
    try {
      const health = await this.client.cluster.health();
      this.logger.log(
        `Connected to Elasticsearch cluster: ${health.cluster_name} (${health.status})`,
      );
      await this.ensureIndexExists();
    } catch (error) {
      this.logger.error('Failed to connect to Elasticsearch:', error);
    }
  }

  private async ensureIndexExists() {
    try {
      const exists = await this.client.indices.exists({ index: this.indexName });

      if (!exists) {
        await this.client.indices.create({
          index: this.indexName,
          body: {
            mappings: {
              properties: {
                content: { type: 'text', analyzer: 'standard' },
                metadata: { type: 'object' },
                embedding_id: { type: 'keyword' },
                timestamp: { type: 'date' },
              },
            },
            settings: {
              number_of_shards: 1,
              number_of_replicas: 1,
              analysis: {
                analyzer: {
                  custom_analyzer: {
                    type: 'standard',
                    stopwords: '_english_',
                  },
                },
              },
            },
          },
        });
        this.logger.log(`Created Elasticsearch index: ${this.indexName}`);
      } else {
        this.logger.log(`Elasticsearch index already exists: ${this.indexName}`);
      }
    } catch (error) {
      this.logger.error('Failed to ensure index exists:', error);
      throw error;
    }
  }

  async indexDocument(id: string, content: string, metadata?: any): Promise<void> {
    try {
      await this.client.index({
        index: this.indexName,
        id,
        document: {
          content,
          metadata,
          embedding_id: id,
          timestamp: new Date(),
        },
      });
      this.logger.log(`Indexed document: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to index document ${id}:`, error);
      throw error;
    }
  }

  async search(query: string, size: number = 10): Promise<any[]> {
    try {
      const result = await this.client.search({
        index: this.indexName,
        body: {
          query: {
            multi_match: {
              query,
              fields: ['content^2', 'metadata.*'],
              type: 'best_fields',
              fuzziness: 'AUTO',
            },
          },
          size,
        },
      });

      return result.hits.hits.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        content: hit._source.content,
        metadata: hit._source.metadata,
      }));
    } catch (error) {
      this.logger.error('Search failed:', error);
      return [];
    }
  }

  async bulkIndex(
    documents: Array<{ id: string; content: string; metadata?: any }>,
  ): Promise<void> {
    try {
      const body = documents.flatMap((doc) => [
        { index: { _index: this.indexName, _id: doc.id } },
        {
          content: doc.content,
          metadata: doc.metadata,
          embedding_id: doc.id,
          timestamp: new Date(),
        },
      ]);

      const result = await this.client.bulk({ body });

      if (result.errors) {
        this.logger.error('Some documents failed to index:', result.items);
      } else {
        this.logger.log(`Bulk indexed ${documents.length} documents`);
      }
    } catch (error) {
      this.logger.error('Bulk indexing failed:', error);
      throw error;
    }
  }

  /**
   * Health check for Elasticsearch connectivity
   */
  async isHealthy(): Promise<{
    healthy: boolean;
    status?: string;
    latencyMs?: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      const health = await this.client.cluster.health();
      return {
        healthy: health.status !== 'red',
        status: health.status,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Delete a document from the index (for rollback support)
   */
  async deleteDocument(id: string): Promise<void> {
    try {
      await this.client.delete({
        index: this.indexName,
        id,
      });
      this.logger.log(`Deleted document: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete document ${id}:`, error);
      throw error;
    }
  }
}
