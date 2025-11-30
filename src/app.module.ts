import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagModule } from './modules/rag/rag.module';
import { VectordbModule } from './modules/vectordb/vectordb.module';
import { LlmModule } from './modules/llm/llm.module';
import { PineconeModule } from './modules/pinecone/pinecone.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import ragConfig from './config/rag.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [ragConfig],
    }),
    // Serve static files from root directory
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..'),
      serveRoot: '/',
    }),
    RagModule,
    VectordbModule,
    LlmModule,
    PineconeModule,
  ],
})
export class AppModule {}
