// modules/llm/llm.service.ts
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

/**
 * Circuit Breaker State
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private groq: Groq;

  // Cache config values to avoid repeated lookups
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly maxTokens: number;
  private readonly hfApiKey: string;

  // Circuit Breaker configuration
  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT = 30000; // 30 seconds

  private circuitBreakers: Map<string, CircuitBreakerState> = new Map([
    ['groq', { failures: 0, lastFailure: 0, isOpen: false }],
    ['huggingface', { failures: 0, lastFailure: 0, isOpen: false }],
  ]);

  constructor(private configService: ConfigService) {
    const groqApiKey = this.configService.get<string>('llm.groq.apiKey');
    this.groq = new Groq({
      apiKey: groqApiKey,
    });

    // Pre-cache config values
    this.model = this.configService.get<string>('llm.groq.model') || 'llama-3.3-70b-versatile';
    this.embeddingModel =
      this.configService.get<string>('llm.huggingface.embeddingModel') ||
      'sentence-transformers/all-MiniLM-L6-v2';
    this.maxTokens = this.configService.get<number>('rag.maxTokens') || 1024;
    this.hfApiKey = this.configService.get<string>('llm.huggingface.apiKey') || '';

    this.logger.log(`✅ LLM Service initialized with Groq (${this.model})`);
  }

  /**
   * Check if circuit is open (preventing calls)
   */
  private isCircuitOpen(service: string): boolean {
    const breaker = this.circuitBreakers.get(service);
    if (!breaker) return false;

    if (breaker.isOpen) {
      // Check if recovery timeout has passed
      if (Date.now() - breaker.lastFailure > this.RECOVERY_TIMEOUT) {
        this.logger.log(`🔄 Circuit breaker for ${service} entering half-open state`);
        breaker.isOpen = false;
        breaker.failures = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Record a failure and potentially open the circuit
   */
  private recordFailure(service: string): void {
    const breaker = this.circuitBreakers.get(service);
    if (!breaker) return;

    breaker.failures++;
    breaker.lastFailure = Date.now();

    if (breaker.failures >= this.FAILURE_THRESHOLD) {
      breaker.isOpen = true;
      this.logger.warn(`🔴 Circuit breaker OPEN for ${service} after ${breaker.failures} failures`);
    }
  }

  /**
   * Record a success and reset failures
   */
  private recordSuccess(service: string): void {
    const breaker = this.circuitBreakers.get(service);
    if (!breaker) return;

    if (breaker.failures > 0) {
      this.logger.log(`✅ Circuit breaker for ${service} recovered`);
    }
    breaker.failures = 0;
    breaker.isOpen = false;
  }

  /**
   * Generate embeddings using Hugging Face Inference API (free)
   * Using all-MiniLM-L6-v2 which outputs 384-dimensional vectors
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Check circuit breaker
    if (this.isCircuitOpen('huggingface')) {
      throw new ServiceUnavailableException(
        'HuggingFace API temporarily unavailable (circuit open)',
      );
    }

    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/pipeline/feature-extraction/${this.embeddingModel}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.hfApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: text,
            options: { wait_for_model: true },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.recordFailure('huggingface');
        throw new Error(`Hugging Face API error: ${response.status} - ${errorText}`);
      }

      const embedding = await response.json();
      this.recordSuccess('huggingface');

      // The API returns the embedding directly as an array
      if (Array.isArray(embedding) && typeof embedding[0] === 'number') {
        return embedding;
      }

      // Sometimes it's nested
      if (Array.isArray(embedding) && Array.isArray(embedding[0])) {
        return embedding[0];
      }

      throw new Error('Unexpected embedding format from Hugging Face API');
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) {
        this.recordFailure('huggingface');
      }
      this.logger.error('Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate a response using Groq
   */
  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    temperature: number = 0.7,
  ): Promise<string> {
    // Check circuit breaker
    if (this.isCircuitOpen('groq')) {
      throw new ServiceUnavailableException('Groq API temporarily unavailable (circuit open)');
    }

    try {
      // Build messages array for Groq
      const groqMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      // Add system prompt if provided
      if (systemPrompt) {
        groqMessages.push({ role: 'system', content: systemPrompt });
      }

      // Add chat history
      for (const msg of messages) {
        const role = msg.role.toLowerCase() === 'user' ? 'user' : 'assistant';
        groqMessages.push({ role, content: msg.content });
      }

      const response = await this.groq.chat.completions.create({
        model: this.model,
        messages: groqMessages,
        temperature,
        max_tokens: this.maxTokens,
      });

      this.recordSuccess('groq');
      return response.choices[0]?.message?.content || '';
    } catch (error) {
      this.recordFailure('groq');
      this.logger.error('LLM generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate streaming response using Groq
   */
  async *generateStreamingResponse(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    temperature: number = 0.7,
  ): AsyncGenerator<string> {
    // Check circuit breaker
    if (this.isCircuitOpen('groq')) {
      throw new ServiceUnavailableException('Groq API temporarily unavailable (circuit open)');
    }

    try {
      // Build messages array for Groq
      const groqMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      // Add system prompt if provided
      if (systemPrompt) {
        groqMessages.push({ role: 'system', content: systemPrompt });
      }

      // Add chat history
      for (const msg of messages) {
        const role = msg.role.toLowerCase() === 'user' ? 'user' : 'assistant';
        groqMessages.push({ role, content: msg.content });
      }

      const stream = await this.groq.chat.completions.create({
        model: this.model,
        messages: groqMessages,
        temperature,
        max_tokens: this.maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }

      this.recordSuccess('groq');
    } catch (error) {
      this.recordFailure('groq');
      this.logger.error('Streaming generation failed:', error);
      throw error;
    }
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus(): Record<string, CircuitBreakerState> {
    const status: Record<string, CircuitBreakerState> = {};
    this.circuitBreakers.forEach((state, service) => {
      status[service] = { ...state };
    });
    return status;
  }
}
