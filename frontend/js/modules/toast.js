/**
 * Toast Notification System
 * Lightweight toast notifications
 */
import Config from '../config.js';
import { createElement, generateId } from '../utils/dom.js';

class ToastService {
  constructor() {
    this.container = null;
    this.toasts = new Map();
    this.init();
  }

  init() {
    this.container = createElement('div', { class: 'toast-container' });
    document.body.appendChild(this.container);
  }

  /**
   * Show toast notification
   */
  show(message, type = 'info', duration = Config.UI.TOAST_DURATION) {
    const id = generateId('toast');

    const toast = createElement(
      'div',
      {
        class: ['toast', type],
        data: { id },
      },
      [
        createElement('span', { class: 'toast-icon' }, [this.getIcon(type)]),
        createElement('span', { class: 'toast-message' }, [message]),
        createElement(
          'button',
          {
            class: 'toast-close btn btn-ghost btn-icon',
            onClick: () => this.dismiss(id),
          },
          ['×'],
        ),
      ],
    );

    this.container.appendChild(toast);
    this.toasts.set(id, toast);

    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  /**
   * Dismiss toast by ID
   */
  dismiss(id) {
    const toast = this.toasts.get(id);
    if (toast) {
      toast.style.animation = 'slideOut 0.3s ease-out forwards';
      setTimeout(() => {
        toast.remove();
        this.toasts.delete(id);
      }, 300);
    }
  }

  /**
   * Dismiss all toasts
   */
  dismissAll() {
    this.toasts.forEach((_, id) => this.dismiss(id));
  }

  /**
   * Get icon for toast type
   */
  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };
    return icons[type] || icons.info;
  }

  // Convenience methods
  success(message, duration) {
    return this.show(message, 'success', duration);
  }
  error(message, duration) {
    return this.show(message, 'error', duration);
  }
  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }
  info(message, duration) {
    return this.show(message, 'info', duration);
  }
}

// Add slideOut animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOut {
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
`;
document.head.appendChild(style);

// Export singleton instance
export const toast = new ToastService();
export default toast;
