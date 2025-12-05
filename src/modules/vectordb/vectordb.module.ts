import { Module } from '@nestjs/common';
import { VectorDbService } from './vectordb.service';
import { PineconeModule } from '../pinecone/pinecone.module';

@Module({
  imports: [PineconeModule],
  providers: [VectorDbService],
  exports: [VectorDbService],
})
export class VectordbModule {}
