import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RagController } from './rag.controller';
import { ConversationController } from './conversation.controller';
import { RagService } from './rag.service';
import { ConversationService } from './conversation.service';
import { RagGateway } from './rag/rag.gateway';
import { VectordbModule } from '../vectordb/vectordb.module';
import { LlmModule } from '../llm/llm.module';
import { RedisModule } from '../redis/redis.module';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';
import { PineconeModule } from '../pinecone/pinecone.module';
import { AuthModule } from '../auth/auth.module';
import { ChatHistory, Document, User, Conversation } from '../database/entities';
import { SessionService, RetrievalService, TrainingService } from './services';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatHistory, Document, User, Conversation]),
    VectordbModule,
    LlmModule,
    RedisModule,
    ElasticsearchModule,
    PineconeModule,
    AuthModule,
  ],
  controllers: [RagController, ConversationController],
  providers: [
    RagService,
    ConversationService,
    RagGateway,
    SessionService,
    RetrievalService,
    TrainingService,
  ],
  exports: [RagService, ConversationService, SessionService, RetrievalService, TrainingService],
})
export class RagModule {}
