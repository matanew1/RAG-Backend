import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateInstructionsDto {
  @ApiProperty({
    description: 'The instructions for the RAG system',
    example: 'You are a helpful AI assistant.',
  })
  @IsString()
  instructions: string;

  @ApiPropertyOptional({
    description: 'Temperature for response generation (0-2)',
    example: 0.7,
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({
    description: 'Number of top results to retrieve (1-10)',
    example: 5,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  topK?: number;
}
