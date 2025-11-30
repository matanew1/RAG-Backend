// modules/pinecone/pinecone.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PineconeService } from './pinecone.service';
import { PineconeInitService } from './pinecone-init.service';

@Module({
  imports: [ConfigModule],
  providers: [PineconeService, PineconeInitService],
  exports: [PineconeService],
})
export class PineconeModule {}
