// modules/rag/rag.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RagService } from '../rag.service';

interface ClientSession {
  sessionId: string;
  connectedAt: Date;
}

@WebSocketGateway({
  cors: {
    origin: true, // Allow all origins for development/testing
    credentials: true,
  },
  namespace: '/chat',
})
export class RagGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RagGateway.name);
  private clients = new Map<string, ClientSession>();

  constructor(private readonly ragService: RagService) {}

  /**
   * Handle client connection
   */
  handleConnection(client: Socket) {
    this.logger.log(`🔌 Client connected: ${client.id}`);

    // Create session for this client
    const sessionId = this.ragService.createSession();

    this.clients.set(client.id, {
      sessionId,
      connectedAt: new Date(),
    });

    // Send session info to client
    client.emit('session:created', {
      sessionId,
      message: 'Connected to RAG chatbot',
    });
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);

    const session = this.clients.get(client.id);
    if (session) {
      // Optionally delete session on disconnect
      // this.ragService.deleteSession(session.sessionId);
      this.clients.delete(client.id);
    }
  }

  /**
   * Handle chat messages
   */
  @SubscribeMessage('chat:message')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { message: string; streaming?: boolean },
  ) {
    const session = this.clients.get(client.id);

    if (!session) {
      client.emit('error', { message: 'Session not found' });
      return;
    }

    this.logger.log(`💬 Message from ${client.id}: ${data.message}`);

    try {
      if (data.streaming !== false) {
        // Streaming response
        client.emit('chat:start', { sessionId: session.sessionId });

        const stream = this.ragService.chatStream(data.message, session.sessionId);

        for await (const chunk of stream) {
          client.emit('chat:chunk', { chunk });
        }

        client.emit('chat:end', { sessionId: session.sessionId });
      } else {
        // Non-streaming response
        const response = await this.ragService.chat(data.message, session.sessionId);

        client.emit('chat:response', {
          response,
          sessionId: session.sessionId,
        });
      }
    } catch (error) {
      this.logger.error('Chat error:', error);
      client.emit('chat:error', {
        message: 'Failed to generate response',
        error: error.message,
      });
    }
  }

  /**
   * Update instructions for a specific session
   */
  @SubscribeMessage('config:update')
  handleConfigUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { instructions: string },
  ) {
    const session = this.clients.get(client.id);

    if (!session) {
      client.emit('error', { message: 'Session not found' });
      return;
    }

    this.ragService.updateInstructions(data.instructions);

    client.emit('config:updated', {
      instructions: data.instructions,
      message: 'Instructions updated',
    });

    this.logger.log(`⚙️  Config updated for client: ${client.id}`);
  }

  /**
   * Clear session history
   */
  @SubscribeMessage('session:clear')
  handleClearSession(@ConnectedSocket() client: Socket) {
    const session = this.clients.get(client.id);

    if (!session) {
      client.emit('error', { message: 'Session not found' });
      return;
    }

    this.ragService.clearSession(session.sessionId);

    client.emit('session:cleared', {
      sessionId: session.sessionId,
      message: 'Session history cleared',
    });

    this.logger.log(`🗑️  Session cleared for client: ${client.id}`);
  }

  /**
   * Get session info
   */
  @SubscribeMessage('session:info')
  handleSessionInfo(@ConnectedSocket() client: Socket) {
    const session = this.clients.get(client.id);

    if (!session) {
      client.emit('error', { message: 'Session not found' });
      return;
    }

    const info = this.ragService.getSessionInfo(session.sessionId);

    client.emit('session:info', info);
  }

  /**
   * Broadcast message to all clients (admin feature)
   */
  @SubscribeMessage('admin:broadcast')
  handleBroadcast(@ConnectedSocket() client: Socket, @MessageBody() data: { message: string }) {
    this.server.emit('broadcast', {
      message: data.message,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`📢 Broadcast from ${client.id}: ${data.message}`);
  }
}
