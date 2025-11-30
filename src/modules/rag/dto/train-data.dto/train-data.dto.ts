import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrainDataDto {
  @ApiProperty({
    description: 'The content to train the RAG system with',
    example: 'This is a sample document for training.',
  })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: 'Optional metadata associated with the training data',
    example: { source: 'user_input', category: 'general' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}
