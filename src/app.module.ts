import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagModule } from './modules/rag/rag.module';
import { VectordbModule } from './modules/vectordb/vectordb.module';
import { LlmModule } from './modules/llm/llm.module';
import { PineconeModule } from './modules/pinecone/pinecone.module';
import { RedisModule } from './modules/redis/redis.module';
import { ElasticsearchModule } from './modules/elasticsearch/elasticsearch.module';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import ragConfig from './config/rag.config';
import { validate } from './config/env.validation';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 10, // 10 requests per 60 seconds
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [ragConfig],
      validate,
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    RagModule,
    VectordbModule,
    LlmModule,
    PineconeModule,
    RedisModule,
    ElasticsearchModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
