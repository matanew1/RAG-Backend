/**
 * WebSocket Service
 * Handles real-time communication with Socket.IO
 */
import Config from '../config.js';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.sessionId = null;
    this.listeners = new Map();
    this.connectionState = 'disconnected';
    this.reconnectAttempts = 0;
  }

  /**
   * Initialize WebSocket connection
   */
  connect() {
    if (this.socket?.connected) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const wsUrl = Config.API.WS_URL + Config.WS.NAMESPACE;

      this.socket = io(wsUrl, {
        transports: ['websocket', 'polling'],
        reconnection: Config.WS.RECONNECTION,
        reconnectionAttempts: Config.WS.RECONNECTION_ATTEMPTS,
        reconnectionDelay: Config.WS.RECONNECTION_DELAY,
        reconnectionDelayMax: Config.WS.RECONNECTION_DELAY_MAX,
        timeout: Config.WS.TIMEOUT,
      });

      this.socket.on('connect', () => {
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.emit('connection:change', { state: 'connected' });
        resolve();
      });

      this.socket.on('session:created', (data) => {
        this.sessionId = data.sessionId;
        this.emit('session:created', data);
      });

      this.socket.on('disconnect', (reason) => {
        this.connectionState = 'disconnected';
        this.emit('connection:change', { state: 'disconnected', reason });
      });

      this.socket.on('connect_error', (error) => {
        this.connectionState = 'error';
        this.reconnectAttempts++;
        this.emit('connection:error', { error, attempts: this.reconnectAttempts });

        if (this.reconnectAttempts >= Config.WS.RECONNECTION_ATTEMPTS) {
          reject(new Error('Max reconnection attempts reached'));
        }
      });

      // Chat events
      this.socket.on('chat:response', (data) => this.emit('chat:response', data));
      this.socket.on('chat:chunk', (data) => this.emit('chat:chunk', data));
      this.socket.on('chat:end', (data) => this.emit('chat:end', data));
      this.socket.on('chat:error', (data) => this.emit('chat:error', data));
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.sessionId = null;
      this.connectionState = 'disconnected';
    }
  }

  /**
   * Send chat message
   */
  sendMessage(message, options = {}) {
    if (!this.socket?.connected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('chat:message', {
      message,
      streaming: Config.FEATURES.STREAMING,
      ...options,
    });
  }

  /**
   * Clear session history
   */
  clearSession() {
    if (this.socket?.connected) {
      this.socket.emit('session:clear');
    }
  }

  /**
   * Update system instructions
   */
  updateConfig(instructions) {
    if (this.socket?.connected) {
      this.socket.emit('config:update', { instructions });
    }
  }

  /**
   * Subscribe to events
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  /**
   * Check connection state
   */
  get isConnected() {
    return this.socket?.connected ?? false;
  }
}

// Export singleton instance
export const ws = new WebSocketService();
export default ws;
