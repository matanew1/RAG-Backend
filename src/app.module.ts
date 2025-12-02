import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagModule } from './modules/rag/rag.module';
import { VectordbModule } from './modules/vectordb/vectordb.module';
import { LlmModule } from './modules/llm/llm.module';
import { PineconeModule } from './modules/pinecone/pinecone.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import ragConfig from './config/rag.config';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [ragConfig],
    }),
    // Serve static files from dist directory (for production)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..'),
      serveRoot: '/',
      serveStaticOptions: {
        index: 'index.html',
        fallthrough: true, // Allow API routes to work
      },
    }),
    RagModule,
    VectordbModule,
    LlmModule,
    PineconeModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
