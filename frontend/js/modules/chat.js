/**
 * Chat Module
 * Handles chat UI and message management
 */
import { $, createElement, scrollToElement, parseMarkdown, escapeHtml } from '../utils/dom.js';
import { ws } from './websocket.js';
import { toast } from './toast.js';
import Config from '../config.js';

class ChatModule {
  constructor() {
    this.messagesContainer = null;
    this.inputField = null;
    this.sendButton = null;
    this.currentStreamMessage = null;
    this.isStreaming = false;
  }

  /**
   * Initialize chat module
   */
  init() {
    this.messagesContainer = $('#messages');
    this.inputField = $('#message-input');
    this.sendButton = $('#send-button');

    if (!this.messagesContainer || !this.inputField) {
      console.error('Chat elements not found');
      return;
    }

    this.bindEvents();
    this.setupWebSocketListeners();
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    // Send on button click
    this.sendButton?.addEventListener('click', () => this.sendMessage());

    // Send on Enter (Shift+Enter for new line)
    this.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    this.inputField.addEventListener('input', () => {
      this.inputField.style.height = 'auto';
      this.inputField.style.height = Math.min(this.inputField.scrollHeight, 200) + 'px';
    });
  }

  /**
   * Setup WebSocket event listeners
   */
  setupWebSocketListeners() {
    ws.on('chat:chunk', (data) => this.handleStreamChunk(data));
    ws.on('chat:end', (data) => this.handleStreamEnd(data));
    ws.on('chat:response', (data) => this.handleResponse(data));
    ws.on('chat:error', (data) => this.handleError(data));
  }

  /**
   * Send message
   */
  sendMessage() {
    const message = this.inputField.value.trim();

    if (!message || this.isStreaming) return;

    if (message.length > Config.UI.MAX_MESSAGE_LENGTH) {
      toast.warning(`Message too long. Max ${Config.UI.MAX_MESSAGE_LENGTH} characters.`);
      return;
    }

    if (!ws.isConnected) {
      toast.error('Not connected. Reconnecting...');
      ws.connect();
      return;
    }

    // Add user message to UI
    this.addMessage(message, 'user');

    // Clear input
    this.inputField.value = '';
    this.inputField.style.height = 'auto';

    // Show typing indicator
    this.showTypingIndicator();

    // Send via WebSocket
    try {
      ws.sendMessage(message);
      this.isStreaming = true;
      this.updateSendButton(true);
    } catch (error) {
      this.hideTypingIndicator();
      toast.error('Failed to send message');
    }
  }

  /**
   * Add message to UI
   */
  addMessage(content, role, options = {}) {
    const isUser = role === 'user';

    const message = createElement(
      'div',
      {
        class: ['message', role],
        data: { role, timestamp: Date.now() },
      },
      [
        createElement('div', { class: 'message-avatar' }, [isUser ? '👤' : '🤖']),
        createElement(
          'div',
          {
            class: 'message-content',
            ...(options.id && { id: options.id }),
          },
          [],
        ),
      ],
    );

    const contentEl = message.querySelector('.message-content');

    if (isUser) {
      contentEl.textContent = content;
    } else {
      contentEl.innerHTML = this.formatMessage(content);
    }

    this.messagesContainer.appendChild(message);
    this.scrollToBottom();

    return message;
  }

  /**
   * Handle streaming chunk
   */
  handleStreamChunk(data) {
    this.hideTypingIndicator();

    if (!this.currentStreamMessage) {
      this.currentStreamMessage = this.addMessage('', 'assistant', {
        id: 'streaming-message',
      });
    }

    const contentEl = this.currentStreamMessage.querySelector('.message-content');
    const currentText = contentEl.dataset.rawText || '';
    const newText = currentText + (data.chunk || data.content || '');

    contentEl.dataset.rawText = newText;
    contentEl.innerHTML = this.formatMessage(newText);

    this.scrollToBottom();
  }

  /**
   * Handle stream end
   */
  handleStreamEnd(data) {
    this.isStreaming = false;
    this.updateSendButton(false);

    if (this.currentStreamMessage) {
      const contentEl = this.currentStreamMessage.querySelector('.message-content');
      delete contentEl.dataset.rawText;
      this.currentStreamMessage.removeAttribute('id');
    }

    this.currentStreamMessage = null;
    this.hideTypingIndicator();
  }

  /**
   * Handle non-streaming response
   */
  handleResponse(data) {
    this.hideTypingIndicator();
    this.isStreaming = false;
    this.updateSendButton(false);

    if (data.response) {
      this.addMessage(data.response, 'assistant');
    }
  }

  /**
   * Handle error
   */
  handleError(data) {
    this.hideTypingIndicator();
    this.isStreaming = false;
    this.updateSendButton(false);
    this.currentStreamMessage = null;

    toast.error(data.message || 'An error occurred');
  }

  /**
   * Show typing indicator
   */
  showTypingIndicator() {
    this.hideTypingIndicator();

    const indicator = createElement(
      'div',
      {
        class: 'message assistant',
        id: 'typing-indicator',
      },
      [
        createElement('div', { class: 'message-avatar' }, ['🤖']),
        createElement('div', { class: 'typing-indicator' }, [
          createElement('span'),
          createElement('span'),
          createElement('span'),
        ]),
      ],
    );

    this.messagesContainer.appendChild(indicator);
    this.scrollToBottom();
  }

  /**
   * Hide typing indicator
   */
  hideTypingIndicator() {
    $('#typing-indicator')?.remove();
  }

  /**
   * Format message content
   */
  formatMessage(content) {
    if (!content) return '';

    if (Config.FEATURES.MARKDOWN) {
      return parseMarkdown(escapeHtml(content));
    }

    return escapeHtml(content).replace(/\n/g, '<br>');
  }

  /**
   * Scroll to bottom of messages
   */
  scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    });
  }

  /**
   * Update send button state
   */
  updateSendButton(disabled) {
    if (this.sendButton) {
      this.sendButton.disabled = disabled;
      this.sendButton.innerHTML = disabled
        ? '<span class="typing-indicator"><span></span><span></span><span></span></span>'
        : '➤';
    }
  }

  /**
   * Clear all messages
   */
  clearMessages() {
    this.messagesContainer.innerHTML = '';
    this.addWelcomeMessage();
  }

  /**
   * Add welcome message
   */
  addWelcomeMessage() {
    const welcome = createElement('div', { class: 'empty-state' }, [
      createElement('div', { class: 'empty-state-icon' }, ['💬']),
      createElement('h3', { class: 'empty-state-title' }, ['Start a conversation']),
      createElement('p', {}, ["Ask me anything! I'm here to help."]),
    ]);

    this.messagesContainer.appendChild(welcome);
  }
}

// Export singleton instance
export const chat = new ChatModule();
export default chat;
