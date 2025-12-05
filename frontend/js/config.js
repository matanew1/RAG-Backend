/**
 * Application Configuration
 * Centralized config for easy environment management
 */
export const Config = Object.freeze({
  // API Endpoints
  API: {
    BASE_URL: window.location.origin + '/v1/rag',
    WS_URL: window.location.origin,
    HEALTH_ENDPOINT: '/health',
    CONFIG_ENDPOINT: '/config',
    TRAIN_ENDPOINT: '/train',
    TRAIN_BATCH_ENDPOINT: '/train/batch',
    CHAT_ENDPOINT: '/chat',
    INDEX: '/index',
    INDEX_DOCS: '/index/documents',
  },

  // WebSocket
  WS: {
    NAMESPACE: '/chat',
    RECONNECTION: true,
    RECONNECTION_ATTEMPTS: 10,
    RECONNECTION_DELAY: 1000,
    RECONNECTION_DELAY_MAX: 5000,
    TIMEOUT: 20000,
  },

  // UI Settings
  UI: {
    TOAST_DURATION: 4000,
    TYPING_DELAY: 50,
    DEBOUNCE_DELAY: 300,
    MAX_MESSAGE_LENGTH: 10000,
    SCROLL_THRESHOLD: 100,
  },

  // Storage Keys
  STORAGE: {
    THEME: 'rag-theme',
    SESSION_ID: 'rag-session-id',
    INSTRUCTIONS: 'rag-instructions',
    HISTORY: 'rag-chat-history',
  },

  // Feature Flags
  FEATURES: {
    STREAMING: true,
    MARKDOWN: true,
    CODE_HIGHLIGHT: true,
    SOUND_EFFECTS: false,
  },
});

export default Config;
