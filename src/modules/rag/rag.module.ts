import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { RagGateway } from './rag/rag.gateway';
import { VectordbModule } from '../vectordb/vectordb.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [VectordbModule, LlmModule],
  controllers: [RagController],
  providers: [RagService, RagGateway],
  exports: [RagService],
})
export class RagModule {}
