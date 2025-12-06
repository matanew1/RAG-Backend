import { IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiPropertyOptional({
    description: 'Initial title for the conversation',
    example: 'Project Discussion',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata for the conversation',
    example: { topic: 'development', priority: 'high' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateConversationDto {
  @ApiPropertyOptional({
    description: 'New title for the conversation',
    example: 'Updated Project Discussion',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Archive status',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { topic: 'updated-topic' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class ConversationMessageDto {
  @ApiProperty({
    description: 'Message content',
    example: 'What is the status of the project?',
  })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    description: 'Enable streaming response',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  streaming?: boolean;
}

export class ConversationListQueryDto {
  @ApiPropertyOptional({
    description: 'Include archived conversations',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({
    description: 'Number of conversations to return',
    example: 20,
    default: 20,
  })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Offset for pagination',
    example: 0,
    default: 0,
  })
  @IsOptional()
  offset?: number;
}

export class ConversationResponseDto {
  @ApiProperty({ description: 'Conversation ID', example: 'uuid-string' })
  id: string;

  @ApiProperty({ description: 'Conversation title', example: 'Project Discussion' })
  title: string;

  @ApiProperty({ description: 'Last message preview', example: 'What is the status...' })
  lastMessage: string | null;

  @ApiProperty({ description: 'Total message count', example: 10 })
  messageCount: number;

  @ApiProperty({ description: 'Archive status', example: false })
  isArchived: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class MessageResponseDto {
  @ApiProperty({ description: 'Message ID', example: 'uuid-string' })
  id: string;

  @ApiProperty({ description: 'Message role', enum: ['user', 'assistant'] })
  role: 'user' | 'assistant';

  @ApiProperty({ description: 'Message content' })
  content: string;

  @ApiProperty({ description: 'Message timestamp' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'Response generation time in ms' })
  responseTime?: number;
}
