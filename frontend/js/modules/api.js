/**
 * API Service
 * Handles all HTTP requests to the backend
 */
import Config from '../config.js';

class ApiService {
  constructor() {
    this.baseUrl = Config.API.BASE_URL;
    this.abortControllers = new Map();
  }

  /**
   * Make HTTP request with error handling
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const requestId = Symbol();

    this.abortControllers.set(requestId, controller);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new ApiError(response.status, error.message || response.statusText);
      }

      return await response.json();
    } finally {
      this.abortControllers.delete(requestId);
    }
  }

  /**
   * GET request
   */
  get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(url);
  }

  /**
   * POST request
   */
  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PUT request
   */
  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request
   */
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  /**
   * Health check
   */
  async checkHealth() {
    try {
      const data = await this.get(Config.API.HEALTH_ENDPOINT);
      return { online: data.status === 'ok', ...data };
    } catch {
      return { online: false };
    }
  }

  /**
   * Get system config
   */
  getConfig() {
    return this.get(Config.API.CONFIG_ENDPOINT);
  }

  /**
   * Update system instructions
   */
  updateConfig(instructions) {
    return this.put(Config.API.CONFIG_ENDPOINT, { instructions });
  }

  /**
   * Train single document
   */
  trainDocument(content, metadata = {}) {
    return this.post(Config.API.TRAIN_ENDPOINT, { content, metadata });
  }

  /**
   * Train batch of documents
   */
  trainBatch(documents) {
    return this.post(Config.API.TRAIN_BATCH_ENDPOINT, { documents });
  }

  /**
   * Get index stats
   */
  getIndexStats() {
    return this.get(Config.API.INDEX_STATS);
  }

  /**
   * Get index info
   */
  getIndexInfo() {
    return this.get(Config.API.INDEX_INFO);
  }

  /**
   * Get indexed documents
   */
  getDocuments(limit = 10) {
    return this.get(Config.API.INDEX_DOCS, { limit });
  }

  /**
   * Abort all pending requests
   */
  abortAll() {
    this.abortControllers.forEach((controller) => controller.abort());
    this.abortControllers.clear();
  }
}

/**
 * Custom API Error
 */
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Export singleton instance
export const api = new ApiService();
export default api;
