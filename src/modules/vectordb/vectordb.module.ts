import { Module } from '@nestjs/common';
import { VectorDbService } from './vectordb.service';

@Module({
  providers: [VectorDbService],
  exports: [VectorDbService],
})
export class VectordbModule {}
