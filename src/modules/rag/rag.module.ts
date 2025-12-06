import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { RagGateway } from './rag/rag.gateway';
import { VectordbModule } from '../vectordb/vectordb.module';
import { LlmModule } from '../llm/llm.module';
import { RedisModule } from '../redis/redis.module';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';
import { PineconeModule } from '../pinecone/pinecone.module';
import { AuthModule } from '../auth/auth.module';
import { ChatHistory, Document, User } from '../database/entities';
import { SessionService, RetrievalService, TrainingService } from './services';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatHistory, Document, User]),
    VectordbModule,
    LlmModule,
    RedisModule,
    ElasticsearchModule,
    PineconeModule,
    AuthModule,
  ],
  controllers: [RagController],
  providers: [RagService, RagGateway, SessionService, RetrievalService, TrainingService],
  exports: [RagService, SessionService, RetrievalService, TrainingService],
})
export class RagModule {}
