/**
 * Modal Component
 * Reusable modal dialog system
 */
import { $, createElement } from '../utils/dom.js';

class ModalService {
  constructor() {
    this.activeModal = null;
    this.overlay = null;
    this.init();
  }

  init() {
    // Create overlay
    this.overlay = createElement('div', {
      class: 'modal-overlay',
      onClick: (e) => {
        if (e.target === this.overlay) this.close();
      },
    });
    document.body.appendChild(this.overlay);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.close();
      }
    });
  }

  /**
   * Open modal
   */
  open(options = {}) {
    const {
      title = '',
      content = '',
      footer = null,
      size = 'md',
      closable = true,
      onClose = null,
    } = options;

    // Create modal
    const modal = createElement(
      'div',
      {
        class: ['modal', `modal-${size}`],
      },
      [
        // Header
        createElement(
          'div',
          { class: 'modal-header' },
          [
            createElement('h3', { class: 'modal-title' }, [title]),
            closable &&
              createElement(
                'button',
                {
                  class: 'btn btn-ghost btn-icon',
                  onClick: () => this.close(),
                },
                ['×'],
              ),
          ].filter(Boolean),
        ),

        // Body
        createElement('div', { class: 'modal-body' }),

        // Footer (optional)
        footer && createElement('div', { class: 'modal-footer' }),
      ].filter(Boolean),
    );

    // Set body content
    const body = modal.querySelector('.modal-body');
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else if (content instanceof Node) {
      body.appendChild(content);
    }

    // Set footer content
    if (footer) {
      const footerEl = modal.querySelector('.modal-footer');
      if (typeof footer === 'string') {
        footerEl.innerHTML = footer;
      } else if (footer instanceof Node) {
        footerEl.appendChild(footer);
      } else if (Array.isArray(footer)) {
        footer.forEach((btn) => footerEl.appendChild(btn));
      }
    }

    // Clear previous modal
    this.overlay.innerHTML = '';
    this.overlay.appendChild(modal);

    // Show overlay
    requestAnimationFrame(() => {
      this.overlay.classList.add('active');
    });

    this.activeModal = { modal, onClose };

    // Focus first input
    const firstInput = modal.querySelector('input, textarea, select');
    firstInput?.focus();

    return modal;
  }

  /**
   * Close modal
   */
  close() {
    if (!this.activeModal) return;

    this.overlay.classList.remove('active');

    if (this.activeModal.onClose) {
      this.activeModal.onClose();
    }

    setTimeout(() => {
      this.overlay.innerHTML = '';
      this.activeModal = null;
    }, 300);
  }

  /**
   * Confirm dialog
   */
  confirm(message, options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Confirm',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        type = 'primary',
      } = options;

      const footer = [
        createElement(
          'button',
          {
            class: 'btn btn-secondary',
            onClick: () => {
              this.close();
              resolve(false);
            },
          },
          [cancelText],
        ),
        createElement(
          'button',
          {
            class: `btn btn-${type}`,
            onClick: () => {
              this.close();
              resolve(true);
            },
          },
          [confirmText],
        ),
      ];

      this.open({
        title,
        content: `<p>${message}</p>`,
        footer,
        size: 'sm',
      });
    });
  }

  /**
   * Alert dialog
   */
  alert(message, title = 'Alert') {
    return new Promise((resolve) => {
      const footer = [
        createElement(
          'button',
          {
            class: 'btn btn-primary',
            onClick: () => {
              this.close();
              resolve();
            },
          },
          ['OK'],
        ),
      ];

      this.open({
        title,
        content: `<p>${message}</p>`,
        footer,
        size: 'sm',
      });
    });
  }

  /**
   * Prompt dialog
   */
  prompt(message, options = {}) {
    return new Promise((resolve) => {
      const { title = 'Input', defaultValue = '', placeholder = '', type = 'text' } = options;

      const input = createElement('input', {
        class: 'form-input',
        type,
        value: defaultValue,
        placeholder,
      });

      const content = createElement('div', { class: 'form-group' }, [
        createElement('label', { class: 'form-label' }, [message]),
        input,
      ]);

      const footer = [
        createElement(
          'button',
          {
            class: 'btn btn-secondary',
            onClick: () => {
              this.close();
              resolve(null);
            },
          },
          ['Cancel'],
        ),
        createElement(
          'button',
          {
            class: 'btn btn-primary',
            onClick: () => {
              this.close();
              resolve(input.value);
            },
          },
          ['OK'],
        ),
      ];

      this.open({ title, content, footer, size: 'sm' });
      input.focus();
    });
  }
}

// Export singleton instance
export const modal = new ModalService();
export default modal;
