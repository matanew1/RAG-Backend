// modules/rag/rag.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { RagService } from './rag.service';
import { VectorDbService } from '../vectordb/vectordb.service';
import { UpdateInstructionsDto } from './dto/instruction.dto/instruction.dto';
import { TrainDataDto } from './dto/train-data.dto/train-data.dto';
import { TrainBatchDto } from './dto/train-batch.dto';
import { ChatMessageDto } from './dto/chat.dto/chat.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('rag')
@Controller('rag')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(
    private readonly ragService: RagService,
    private readonly vectorDbService: VectorDbService,
  ) {}

  /**
   * GET /rag/config - Get current RAG configuration
   */
  @Get('config')
  @ApiOperation({ summary: 'Get RAG configuration' })
  @ApiResponse({
    status: 200,
    description: 'Current RAG configuration',
    schema: {
      type: 'object',
      properties: {
        instructions: { type: 'string', example: 'You are a helpful AI assistant.' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  getConfig() {
    return {
      instructions: this.ragService.getInstructions(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * PUT /rag/config - Update RAG instructions
   */
  @Put('config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update RAG configuration' })
  @ApiBody({ type: UpdateInstructionsDto })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        instructions: { type: 'string' },
        message: { type: 'string', example: 'Instructions updated successfully' },
      },
    },
  })
  updateConfig(@Body() dto: UpdateInstructionsDto) {
    this.ragService.updateInstructions(dto.instructions);

    this.logger.log('📝 Configuration updated via REST API');

    return {
      success: true,
      instructions: dto.instructions,
      message: 'Instructions updated successfully',
    };
  }

  /**
   * POST /rag/train - Train with single document
   */
  @Post('train')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Train RAG system with single document' })
  @ApiBody({ type: TrainDataDto })
  @ApiResponse({
    status: 201,
    description: 'Training data added successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Training data added successfully' },
      },
    },
  })
  async trainSingle(@Body() dto: TrainDataDto) {
    await this.ragService.trainWithData(dto.content, dto.metadata);

    return {
      success: true,
      message: 'Training data added successfully',
    };
  }

  /**
   * POST /rag/train/batch - Train with multiple documents
   */
  @Post('train/batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Train RAG system with multiple documents' })
  @ApiBody({ type: TrainBatchDto })
  @ApiResponse({
    status: 201,
    description: 'Batch training completed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        count: { type: 'number', example: 5 },
        message: { type: 'string', example: 'Batch training completed successfully' },
      },
    },
  })
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 per minute
  async trainBatch(@Body() dto: TrainBatchDto) {
    await this.ragService.trainBatch(dto.documents);

    return {
      success: true,
      count: dto.documents.length,
      message: 'Batch training completed successfully',
    };
  }

  /**
   * POST /rag/session - Create new chat session
   */
  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new chat session' })
  @ApiResponse({
    status: 201,
    description: 'Session created successfully',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', example: 'session-123' },
        message: { type: 'string', example: 'Session created successfully' },
      },
    },
  })
  async createSession() {
    const sessionId = await this.ragService.createSession();

    return {
      sessionId,
      message: 'Session created successfully',
    };
  }

  /**
   * GET /rag/session/:id - Get session info
   */
  @Get('session/:id')
  @ApiOperation({ summary: 'Get session information' })
  @ApiParam({ name: 'id', description: 'Session ID', example: 'session-123' })
  @ApiResponse({
    status: 200,
    description: 'Session information',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        messageCount: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Session not found',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Session not found' },
      },
    },
  })
  async getSession(@Param('id') sessionId: string) {
    const info = await this.ragService.getSessionInfo(sessionId);

    if (!info) {
      return {
        error: 'Session not found',
      };
    }

    return info;
  }

  /**
   * DELETE /rag/session/:id - Delete session
   */
  @Delete('session/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete chat session' })
  @ApiParam({ name: 'id', description: 'Session ID', example: 'session-123' })
  @ApiResponse({ status: 204, description: 'Session deleted successfully' })
  async deleteSession(@Param('id') sessionId: string) {
    await this.ragService.deleteSession(sessionId);
  }

  /**
   * POST /rag/session/:id/clear - Clear session history
   */
  @Post('session/:id/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear session history' })
  @ApiParam({ name: 'id', description: 'Session ID', example: 'session-123' })
  @ApiResponse({
    status: 200,
    description: 'Session history cleared',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Session history cleared' },
      },
    },
  })
  async clearSession(@Param('id') sessionId: string) {
    await this.ragService.clearSession(sessionId);

    return {
      success: true,
      message: 'Session history cleared',
    };
  }

  /**
   * POST /rag/chat - Chat via REST (non-streaming)
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send chat message (non-streaming)' })
  @ApiBody({ type: ChatMessageDto })
  @ApiResponse({
    status: 200,
    description: 'Chat response',
    schema: {
      type: 'object',
      properties: {
        response: { type: 'string', example: 'Hello! How can I help you?' },
        sessionId: { type: 'string', example: 'session-123' },
      },
    },
  })
  async chat(@Body() body: ChatMessageDto) {
    const response = await this.ragService.chat(body.message, body.sessionId);

    return {
      response,
      sessionId: body.sessionId,
    };
  }

  /**
   * GET /rag/health - Health check
   */
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({
    status: 200,
    description: 'Service health status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
        service: { type: 'string', example: 'RAG Backend' },
      },
    },
  })
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'RAG Backend',
    };
  }

  /**
   * GET /rag/index - Get Pinecone index info and statistics (consolidated)
   */
  @Get('index')
  @ApiOperation({ summary: 'Get Pinecone index info and statistics' })
  @ApiResponse({
    status: 200,
    description: 'Index info and statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'rag-index' },
            dimension: { type: 'number', example: 384 },
            metric: { type: 'string', example: 'cosine' },
            host: { type: 'string' },
            status: { type: 'string', example: 'Ready' },
            totalVectors: { type: 'number', example: 150 },
            indexFullness: { type: 'number', example: 0.1 },
          },
        },
      },
    },
  })
  async getIndex() {
    const [info, stats] = await Promise.all([
      this.vectorDbService.getIndexInfo(),
      this.vectorDbService.getIndexStats(),
    ]);
    return {
      success: true,
      data: { ...info, ...stats },
    };
  }

  /**
   * GET /rag/index/documents - List documents in the index
   */
  @Get('index/documents')
  @ApiOperation({ summary: 'List documents in the Pinecone index' })
  @ApiResponse({
    status: 200,
    description: 'Documents retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              content: { type: 'string' },
              metadata: { type: 'object' },
              score: { type: 'number' },
            },
          },
        },
        count: { type: 'number' },
      },
    },
  })
  async listDocuments(@Query('limit') limit: string = '50', @Query('offset') offset: string = '0') {
    const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100
    const offsetNum = parseInt(offset) || 0;

    const documents = await this.vectorDbService.listDocuments(limitNum, offsetNum);
    return {
      success: true,
      data: documents,
      count: documents.length,
    };
  }
}
