// modules/rag/conversation.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConversationService } from './conversation.service';
import {
  CreateConversationDto,
  UpdateConversationDto,
  ConversationMessageDto,
  ConversationListQueryDto,
  ConversationResponseDto,
  MessageResponseDto,
} from './dto/conversation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('conversations')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'rag/conversations', version: '1' })
@UseGuards(JwtAuthGuard)
export class ConversationController {
  private readonly logger = new Logger(ConversationController.name);

  constructor(private readonly conversationService: ConversationService) {}

  /**
   * GET /v1/rag/conversations - List all conversations for the authenticated user
   */
  @Get()
  @ApiOperation({ summary: 'List all conversations for the current user' })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description: 'Include archived conversations',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of results (default: 20)',
  })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset for pagination' })
  @ApiResponse({
    status: 200,
    description: 'List of conversations',
    schema: {
      type: 'object',
      properties: {
        conversations: {
          type: 'array',
          items: { $ref: '#/components/schemas/ConversationResponseDto' },
        },
        total: { type: 'number', example: 25 },
      },
    },
  })
  async listConversations(
    @Request() req,
    @Query('includeArchived') includeArchived?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = req.user.userId;

    return this.conversationService.listConversations(userId, {
      includeArchived: includeArchived === 'true',
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /**
   * POST /v1/rag/conversations - Create a new conversation
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new conversation' })
  @ApiBody({ type: CreateConversationDto })
  @ApiResponse({
    status: 201,
    description: 'Conversation created successfully',
    type: ConversationResponseDto,
  })
  async createConversation(@Request() req, @Body() dto: CreateConversationDto) {
    const userId = req.user.userId;
    const conversation = await this.conversationService.createConversation(userId, dto);

    this.logger.log(`📝 Created conversation for user: ${userId}`);

    return conversation;
  }

  /**
   * GET /v1/rag/conversations/:id - Get a single conversation
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get conversation details' })
  @ApiParam({ name: 'id', description: 'Conversation ID', example: 'uuid-string' })
  @ApiResponse({
    status: 200,
    description: 'Conversation details',
    type: ConversationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getConversation(@Request() req, @Param('id') conversationId: string) {
    const userId = req.user.userId;
    return this.conversationService.getConversation(conversationId, userId);
  }

  /**
   * GET /v1/rag/conversations/:id/messages - Get all messages in a conversation
   */
  @Get(':id/messages')
  @ApiOperation({ summary: 'Get all messages in a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID', example: 'uuid-string' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of messages (default: 50)',
  })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset for pagination' })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['ASC', 'DESC'],
    description: 'Sort order (default: ASC)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of messages',
    schema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: { $ref: '#/components/schemas/MessageResponseDto' },
        },
        total: { type: 'number', example: 50 },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getConversationMessages(
    @Request() req,
    @Param('id') conversationId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('order') order?: 'ASC' | 'DESC',
  ) {
    const userId = req.user.userId;

    return this.conversationService.getConversationMessages(conversationId, userId, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      order: order || 'ASC',
    });
  }

  /**
   * PATCH /v1/rag/conversations/:id - Update a conversation (rename, archive)
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update conversation (rename, archive, etc.)' })
  @ApiParam({ name: 'id', description: 'Conversation ID', example: 'uuid-string' })
  @ApiBody({ type: UpdateConversationDto })
  @ApiResponse({
    status: 200,
    description: 'Conversation updated successfully',
    type: ConversationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async updateConversation(
    @Request() req,
    @Param('id') conversationId: string,
    @Body() dto: UpdateConversationDto,
  ) {
    const userId = req.user.userId;

    this.logger.log(`✏️ Updating conversation: ${conversationId}`);

    return this.conversationService.updateConversation(conversationId, userId, dto);
  }

  /**
   * DELETE /v1/rag/conversations/:id - Delete a conversation
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a conversation and all its messages' })
  @ApiParam({ name: 'id', description: 'Conversation ID', example: 'uuid-string' })
  @ApiResponse({ status: 204, description: 'Conversation deleted successfully' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async deleteConversation(@Request() req, @Param('id') conversationId: string) {
    const userId = req.user.userId;

    this.logger.log(`🗑️ Deleting conversation: ${conversationId}`);

    await this.conversationService.deleteConversation(conversationId, userId);
  }

  /**
   * POST /v1/rag/conversations/:id/messages - Send a message in an existing conversation
   */
  @Post(':id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a message in an existing conversation (continue chat)' })
  @ApiParam({ name: 'id', description: 'Conversation ID', example: 'uuid-string' })
  @ApiBody({ type: ConversationMessageDto })
  @ApiResponse({
    status: 200,
    description: 'Chat response',
    schema: {
      type: 'object',
      properties: {
        response: { type: 'string', example: 'Here is my response...' },
        conversationId: { type: 'string', example: 'uuid-string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async sendMessage(
    @Request() req,
    @Res() res: Response,
    @Param('id') conversationId: string,
    @Body() dto: ConversationMessageDto,
  ) {
    const userId = req.user.userId;

    this.logger.log(`💬 Message in conversation: ${conversationId}`);

    if (dto.streaming) {
      // Streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = (await this.conversationService.sendMessage(
        conversationId,
        userId,
        dto.message,
        true,
      )) as AsyncGenerator<string>;

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } else {
      // Non-streaming response
      const response = (await this.conversationService.sendMessage(
        conversationId,
        userId,
        dto.message,
        false,
      )) as string;

      res.json({
        response,
        conversationId,
      });
    }
  }

  /**
   * POST /v1/rag/conversations/:id/archive - Archive a conversation
   */
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID', example: 'uuid-string' })
  @ApiResponse({
    status: 200,
    description: 'Conversation archived',
    type: ConversationResponseDto,
  })
  async archiveConversation(@Request() req, @Param('id') conversationId: string) {
    const userId = req.user.userId;

    return this.conversationService.updateConversation(conversationId, userId, {
      isArchived: true,
    });
  }

  /**
   * POST /v1/rag/conversations/:id/unarchive - Unarchive a conversation
   */
  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unarchive a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID', example: 'uuid-string' })
  @ApiResponse({
    status: 200,
    description: 'Conversation unarchived',
    type: ConversationResponseDto,
  })
  async unarchiveConversation(@Request() req, @Param('id') conversationId: string) {
    const userId = req.user.userId;

    return this.conversationService.updateConversation(conversationId, userId, {
      isArchived: false,
    });
  }
}
