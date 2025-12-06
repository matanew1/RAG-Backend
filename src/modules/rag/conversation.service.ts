// modules/rag/conversation.service.ts
import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ChatHistory } from '../database/entities';
import { RagService } from './rag.service';
import {
  CreateConversationDto,
  UpdateConversationDto,
  ConversationResponseDto,
  MessageResponseDto,
} from './dto/conversation.dto';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(ChatHistory)
    private chatHistoryRepository: Repository<ChatHistory>,
    private ragService: RagService,
  ) {}

  /**
   * Create a new conversation for a user
   */
  async createConversation(
    userId: string,
    dto?: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    const conversation = this.conversationRepository.create({
      userId,
      title: dto?.title || 'New Conversation',
      metadata: dto?.metadata,
      messageCount: 0,
    });

    const saved = await this.conversationRepository.save(conversation);
    this.logger.log(`📝 Created conversation: ${saved.id} for user: ${userId}`);

    return this.toConversationResponse(saved);
  }

  /**
   * List all conversations for a user
   */
  async listConversations(
    userId: string,
    options: { includeArchived?: boolean; limit?: number; offset?: number } = {},
  ): Promise<{ conversations: ConversationResponseDto[]; total: number }> {
    const { includeArchived = false, limit = 20, offset = 0 } = options;

    const queryBuilder = this.conversationRepository
      .createQueryBuilder('conversation')
      .where('conversation.userId = :userId', { userId })
      .orderBy('conversation.updatedAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (!includeArchived) {
      queryBuilder.andWhere('conversation.isArchived = :isArchived', { isArchived: false });
    }

    const [conversations, total] = await queryBuilder.getManyAndCount();

    this.logger.log(`📋 Listed ${conversations.length} conversations for user: ${userId}`);

    return {
      conversations: conversations.map((c) => this.toConversationResponse(c)),
      total,
    };
  }

  /**
   * Get a single conversation by ID
   */
  async getConversation(conversationId: string, userId: string): Promise<ConversationResponseDto> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    return this.toConversationResponse(conversation);
  }

  /**
   * Get all messages for a conversation
   */
  async getConversationMessages(
    conversationId: string,
    userId: string,
    options: { limit?: number; offset?: number; order?: 'ASC' | 'DESC' } = {},
  ): Promise<{ messages: MessageResponseDto[]; total: number }> {
    const { limit = 50, offset = 0, order = 'ASC' } = options;

    // Verify ownership
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    const [messages, total] = await this.chatHistoryRepository
      .createQueryBuilder('message')
      .where('message.conversationId = :conversationId', { conversationId })
      .orderBy('message.createdAt', order)
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    this.logger.log(`📨 Fetched ${messages.length} messages for conversation: ${conversationId}`);

    return {
      messages: messages.map((m) => this.toMessageResponse(m)),
      total,
    };
  }

  /**
   * Update conversation (rename, archive, etc.)
   */
  async updateConversation(
    conversationId: string,
    userId: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    // Update fields
    if (dto.title !== undefined) {
      conversation.title = dto.title;
    }
    if (dto.isArchived !== undefined) {
      conversation.isArchived = dto.isArchived;
    }
    if (dto.metadata !== undefined) {
      conversation.metadata = { ...conversation.metadata, ...dto.metadata };
    }

    const updated = await this.conversationRepository.save(conversation);
    this.logger.log(`✏️ Updated conversation: ${conversationId}`);

    return this.toConversationResponse(updated);
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    // Delete conversation (messages will cascade)
    await this.conversationRepository.remove(conversation);
    this.logger.log(`🗑️ Deleted conversation: ${conversationId}`);
  }

  /**
   * Send a message in a conversation (continue existing chat)
   */
  async sendMessage(
    conversationId: string,
    userId: string,
    message: string,
    streaming: boolean = false,
  ): Promise<string | AsyncGenerator<string>> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    // Load existing message history for context
    const existingMessages = await this.chatHistoryRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      take: 20, // Last 20 messages for context
    });

    // Build history for RAG service
    const history = existingMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Use the conversation ID as session ID for the RAG service
    if (streaming) {
      return this.streamMessageWithHistory(conversationId, userId, message, history, conversation);
    } else {
      return this.sendMessageWithHistory(conversationId, userId, message, history, conversation);
    }
  }

  /**
   * Send message with existing history (non-streaming)
   */
  private async sendMessageWithHistory(
    conversationId: string,
    userId: string,
    message: string,
    history: Array<{ role: string; content: string }>,
    conversation: Conversation,
  ): Promise<string> {
    const startTime = Date.now();

    // Use RAG service to generate response
    const response = await this.ragService.chatWithHistory(message, conversationId, history);

    const responseTime = Date.now() - startTime;

    // Save user message
    await this.chatHistoryRepository.save({
      sessionId: conversationId,
      conversationId,
      userId,
      role: 'user' as const,
      content: message,
    });

    // Save assistant response
    await this.chatHistoryRepository.save({
      sessionId: conversationId,
      conversationId,
      userId,
      role: 'assistant' as const,
      content: response,
      responseTime,
    });

    // Update conversation metadata
    await this.updateConversationMetadata(conversation, message, response);

    return response;
  }

  /**
   * Stream message with existing history
   */
  private async *streamMessageWithHistory(
    conversationId: string,
    userId: string,
    message: string,
    history: Array<{ role: string; content: string }>,
    conversation: Conversation,
  ): AsyncGenerator<string> {
    const startTime = Date.now();

    // Save user message immediately
    await this.chatHistoryRepository.save({
      sessionId: conversationId,
      conversationId,
      userId,
      role: 'user' as const,
      content: message,
    });

    // Stream response from RAG service
    let fullResponse = '';
    const stream = this.ragService.chatStreamWithHistory(message, conversationId, history);

    for await (const chunk of stream) {
      fullResponse += chunk;
      yield chunk;
    }

    const responseTime = Date.now() - startTime;

    // Save complete assistant response
    await this.chatHistoryRepository.save({
      sessionId: conversationId,
      conversationId,
      userId,
      role: 'assistant' as const,
      content: fullResponse,
      responseTime,
    });

    // Update conversation metadata
    await this.updateConversationMetadata(conversation, message, fullResponse);
  }

  /**
   * Update conversation with latest message info
   */
  private async updateConversationMetadata(
    conversation: Conversation,
    userMessage: string,
    assistantResponse: string,
  ): Promise<void> {
    conversation.messageCount += 2;
    conversation.lastMessage =
      assistantResponse.length > 100
        ? assistantResponse.substring(0, 100) + '...'
        : assistantResponse;

    // Auto-generate title from first message if still default
    if (conversation.title === 'New Conversation' && conversation.messageCount === 2) {
      conversation.title = this.generateTitle(userMessage);
    }

    await this.conversationRepository.save(conversation);
  }

  /**
   * Generate a conversation title from the first message
   */
  private generateTitle(message: string): string {
    // Take first 50 chars or first sentence, whichever is shorter
    const firstSentence = message.split(/[.!?]/)[0];
    const title =
      firstSentence.length > 50 ? firstSentence.substring(0, 47) + '...' : firstSentence;
    return title || 'New Conversation';
  }

  /**
   * Convert Conversation entity to response DTO
   */
  private toConversationResponse(conversation: Conversation): ConversationResponseDto {
    return {
      id: conversation.id,
      title: conversation.title,
      lastMessage: conversation.lastMessage,
      messageCount: conversation.messageCount,
      isArchived: conversation.isArchived,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  /**
   * Convert ChatHistory entity to message response DTO
   */
  private toMessageResponse(message: ChatHistory): MessageResponseDto {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      responseTime: message.responseTime,
    };
  }
}
