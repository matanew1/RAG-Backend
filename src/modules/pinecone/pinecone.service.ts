// modules/pinecone/pinecone.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pinecone } from '@pinecone-database/pinecone';

@Injectable()
export class PineconeService {
  private readonly logger = new Logger(PineconeService.name);
  private pinecone: Pinecone;
  private indexName: string;

  constructor(private configService: ConfigService) {
    this.initializePinecone();
  }

  private async initializePinecone() {
    try {
      const apiKey = this.configService.get<string>('vectorDb.pinecone.apiKey');

      this.pinecone = new Pinecone({
        apiKey: apiKey!,
      });

      this.indexName =
        this.configService.get<string>('vectorDb.pinecone.indexName') || 'rag-chatbot';

      this.logger.log('✅ Pinecone client initialized');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Pinecone client:', error);
      throw error;
    }
  }

  /**
   * Check if the index already exists
   */
  async indexExists(): Promise<boolean> {
    try {
      const indexList = await this.pinecone.listIndexes();
      const exists = indexList.indexes?.some((index) => index.name === this.indexName) || false;

      if (exists) {
        this.logger.log(`✅ Index "${this.indexName}" already exists`);
      } else {
        this.logger.log(`ℹ️ Index "${this.indexName}" does not exist`);
      }

      return exists;
    } catch (error) {
      this.logger.error('❌ Error checking index existence:', error);
      return false;
    }
  }

  /**
   * Create the Pinecone index if it doesn't exist
   */
  async createIndexIfNotExists(): Promise<void> {
    const exists = await this.indexExists();

    if (exists) {
      this.logger.log('⏭️ Skipping index creation - already exists');
      return;
    }

    try {
      this.logger.log(`📝 Creating Pinecone index: ${this.indexName}`);

      await this.pinecone.createIndex({
        name: this.indexName,
        dimension: 1536, // Matching Groq embedding dimensions
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });

      this.logger.log(`✅ Index "${this.indexName}" created successfully`);

      // Wait for index to be ready
      await this.waitForIndexReady();
    } catch (error) {
      this.logger.error('❌ Failed to create index:', error);
      throw error;
    }
  }

  /**
   * Wait for the index to be ready after creation
   */
  private async waitForIndexReady(maxAttempts: number = 30): Promise<void> {
    this.logger.log('⏳ Waiting for index to be ready...');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const index = this.pinecone.index(this.indexName);
        await index.describeIndexStats();
        this.logger.log('✅ Index is ready!');
        return;
      } catch (error) {
        this.logger.log(`⏳ Waiting... (${attempt}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
      }
    }

    throw new Error(
      `Index "${this.indexName}" failed to become ready after ${maxAttempts} attempts`,
    );
  }

  /**
   * Get index statistics
   */
  async getIndexStats() {
    try {
      const index = this.pinecone.index(this.indexName);
      const stats = await index.describeIndexStats();
      return stats;
    } catch (error) {
      this.logger.error('❌ Failed to get index stats:', error);
      throw error;
    }
  }

  /**
   * Delete the index (use with caution!)
   */
  async deleteIndex(): Promise<void> {
    try {
      await this.pinecone.deleteIndex(this.indexName);
      this.logger.log(`🗑️ Index "${this.indexName}" deleted successfully`);
    } catch (error) {
      this.logger.error('❌ Failed to delete index:', error);
      throw error;
    }
  }

  /**
   * Get the Pinecone client instance (for advanced operations)
   */
  getClient(): Pinecone {
    return this.pinecone;
  }

  /**
   * Get the index name
   */
  getIndexName(): string {
    return this.indexName;
  }
}
