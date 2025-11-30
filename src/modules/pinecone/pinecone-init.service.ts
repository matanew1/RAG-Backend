// modules/pinecone/pinecone-init.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PineconeService } from './pinecone.service';

@Injectable()
export class PineconeInitService implements OnModuleInit {
  private readonly logger = new Logger(PineconeInitService.name);

  constructor(private readonly pineconeService: PineconeService) {}

  async onModuleInit() {
    try {
      this.logger.log('🚀 Initializing Pinecone index...');
      await this.pineconeService.createIndexIfNotExists();
      this.logger.log('✅ Pinecone initialization completed');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Pinecone:', error);
      // Don't throw here to prevent app startup failure
      // The app can still run without the index initially
    }
  }
}
