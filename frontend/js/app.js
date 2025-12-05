/**
 * Main Application Entry Point
 * Initializes all modules and orchestrates the application
 */
import Config from './config.js';
import { $, $$ } from './utils/dom.js';
import { api } from './modules/api.js';
import { ws } from './modules/websocket.js';
import { chat } from './modules/chat.js';
import { toast } from './modules/toast.js';
import { modal } from './modules/modal.js';

class App {
  constructor() {
    this.isOnline = false;
    this.statsInterval = null;
  }

  /**
   * Initialize application
   */
  async init() {
    console.log('🚀 RAG Chat initializing...');

    // Initialize modules
    chat.init();

    // Bind global events
    this.bindEvents();

    // Connect WebSocket
    await this.connect();

    // Check health
    await this.checkHealth();

    // Start health polling
    this.startHealthPolling();

    console.log('✅ RAG Chat ready');
  }

  /**
   * Bind global event handlers
   */
  bindEvents() {
    // Settings button
    $('#settings-btn')?.addEventListener('click', () => this.openSettings());

    // Clear chat button
    $('#clear-chat-btn')?.addEventListener('click', () => this.clearChat());

    // Training button
    $('#training-btn')?.addEventListener('click', () => this.openTraining());

    // Stats button
    $('#stats-btn')?.addEventListener('click', () => this.openStats());

    // Mobile menu toggle
    $('#menu-toggle')?.addEventListener('click', () => this.toggleSidebar());

    // Sidebar overlay close
    $('.sidebar-overlay')?.addEventListener('click', () => this.closeSidebar());

    // Connection status click
    $('#connection-status')?.addEventListener('click', () => this.reconnect());

    // Window online/offline
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !ws.isConnected) {
        this.connect();
      }
    });
  }

  /**
   * Connect to WebSocket
   */
  async connect() {
    try {
      await ws.connect();
      this.updateConnectionStatus(true);

      ws.on('connection:change', ({ state }) => {
        this.updateConnectionStatus(state === 'connected');
      });

      ws.on('session:created', ({ sessionId }) => {
        console.log('Session created:', sessionId);
      });
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      this.updateConnectionStatus(false);
      toast.error('Connection failed. Click status to retry.');
    }
  }

  /**
   * Reconnect WebSocket
   */
  async reconnect() {
    toast.info('Reconnecting...');
    ws.disconnect();
    await this.connect();
  }

  /**
   * Check backend health
   */
  async checkHealth() {
    try {
      const health = await api.checkHealth();
      this.isOnline = health.online;
      this.updateConnectionStatus(health.online);
    } catch {
      this.isOnline = false;
      this.updateConnectionStatus(false);
    }
  }

  /**
   * Start health polling
   */
  startHealthPolling() {
    setInterval(() => this.checkHealth(), 30000);
  }

  /**
   * Update connection status UI
   */
  updateConnectionStatus(online) {
    const statusEl = $('#connection-status');
    if (!statusEl) return;

    statusEl.className = `status-indicator ${online ? '' : 'offline'}`;
    statusEl.innerHTML = `
      <span class="status-dot"></span>
      <span>${online ? 'Connected' : 'Offline'}</span>
    `;
  }

  /**
   * Handle browser online event
   */
  handleOnline() {
    toast.success('Back online');
    this.connect();
  }

  /**
   * Handle browser offline event
   */
  handleOffline() {
    toast.warning('You are offline');
    this.updateConnectionStatus(false);
  }

  /**
   * Open settings modal
   */
  async openSettings() {
    try {
      const config = await api.getConfig();

      const content = document.createElement('div');
      content.innerHTML = `
        <div class="form-group">
          <label class="form-label">System Instructions</label>
          <textarea class="form-textarea" id="instructions-input" rows="6" 
            placeholder="Enter system instructions...">${config.instructions || ''}</textarea>
        </div>
        <p class="text-sm text-muted">These instructions guide the AI's behavior and responses.</p>
      `;

      const footer = [
        this.createButton('Cancel', 'secondary', () => modal.close()),
        this.createButton('Save', 'primary', async () => {
          const instructions = $('#instructions-input').value;
          try {
            await api.updateConfig(instructions);
            ws.updateConfig(instructions);
            toast.success('Settings saved');
            modal.close();
          } catch {
            toast.error('Failed to save settings');
          }
        }),
      ];

      modal.open({ title: '⚙️ Settings', content, footer });
    } catch {
      toast.error('Failed to load settings');
    }
  }

  /**
   * Open training modal
   */
  openTraining() {
    const content = document.createElement('div');
    content.innerHTML = `
      <div class="form-group">
        <label class="form-label">Document Content</label>
        <textarea class="form-textarea" id="train-content" rows="6" 
          placeholder="Enter the content to train..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Metadata (JSON, optional)</label>
        <textarea class="form-textarea" id="train-metadata" rows="3" 
          placeholder='{"source": "manual", "category": "general"}'></textarea>
      </div>
    `;

    const footer = [
      this.createButton('Cancel', 'secondary', () => modal.close()),
      this.createButton('Train', 'primary', async () => {
        const content = $('#train-content').value.trim();
        const metadataStr = $('#train-metadata').value.trim();

        if (!content) {
          toast.warning('Please enter content');
          return;
        }

        let metadata = {};
        if (metadataStr) {
          try {
            metadata = JSON.parse(metadataStr);
          } catch {
            toast.error('Invalid JSON in metadata');
            return;
          }
        }

        try {
          await api.trainDocument(content, metadata);
          toast.success('Document trained successfully');
          modal.close();
        } catch {
          toast.error('Training failed');
        }
      }),
    ];

    modal.open({ title: '📚 Train Document', content, footer });
  }

  /**
   * Open stats modal
   */
  async openStats() {
    try {
      const [stats, info] = await Promise.all([api.getIndexStats(), api.getIndexInfo()]);

      const content = document.createElement('div');
      content.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.vectorCount || stats.totalVectors || 0}</div>
            <div class="stat-label">Total Vectors</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${info.dimension || 384}</div>
            <div class="stat-label">Dimensions</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${info.metric || 'cosine'}</div>
            <div class="stat-label">Similarity Metric</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.namespaces?.['']?.vectorCount || stats.vectorCount || 0}</div>
            <div class="stat-label">Default Namespace</div>
          </div>
        </div>
        <div class="ai-info" style="margin-top: 1rem; padding: 1rem; background: rgba(99, 102, 241, 0.1); border-radius: 8px;">
          <p style="font-size: 0.875rem; color: var(--text-muted);">
            <strong>🧠 AI Providers:</strong><br>
            • Chat: Groq (llama-3.3-70b-versatile)<br>
            • Embeddings: HuggingFace (all-MiniLM-L6-v2)
          </p>
        </div>
      `;

      modal.open({ title: '📊 Index Statistics', content, size: 'md' });
    } catch {
      toast.error('Failed to load statistics');
    }
  }

  /**
   * Clear chat history
   */
  async clearChat() {
    const confirmed = await modal.confirm('Are you sure you want to clear the chat history?', {
      title: 'Clear Chat',
      type: 'error',
      confirmText: 'Clear',
    });

    if (confirmed) {
      chat.clearMessages();
      ws.clearSession();
      toast.success('Chat cleared');
    }
  }

  /**
   * Toggle mobile sidebar
   */
  toggleSidebar() {
    $('.sidebar')?.classList.toggle('open');
    $('.sidebar-overlay')?.classList.toggle('active');
  }

  /**
   * Close mobile sidebar
   */
  closeSidebar() {
    $('.sidebar')?.classList.remove('open');
    $('.sidebar-overlay')?.classList.remove('active');
  }

  /**
   * Create button element
   */
  createButton(text, type, onClick) {
    const btn = document.createElement('button');
    btn.className = `btn btn-${type}`;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }
}

// Initialize app when DOM is ready
const app = new App();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Export for debugging
window.RAGChat = { app, api, ws, chat, toast, modal, Config };
