import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({
    description: 'The message to send to the chat',
    example: 'Hello, how can you help me?',
  })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    description: 'Optional session ID for maintaining conversation context',
    example: 'session-123',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
