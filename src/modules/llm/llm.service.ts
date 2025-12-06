// modules/llm/llm.service.ts
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { InferenceClient } from '@huggingface/inference';

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
  private hfClient: InferenceClient;

  // Cache config values to avoid repeated lookups
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly maxTokens: number;

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

    // Initialize HuggingFace Inference client
    const hfApiKey = this.configService.get<string>('llm.huggingface.apiKey') || '';
    this.hfClient = new InferenceClient(hfApiKey);

    // Pre-cache config values
    this.model = this.configService.get<string>('llm.groq.model') || 'llama-3.3-70b-versatile';
    this.embeddingModel =
      this.configService.get<string>('llm.huggingface.embeddingModel') ||
      'sentence-transformers/all-MiniLM-L6-v2';
    this.maxTokens = this.configService.get<number>('rag.maxTokens') || 1024;

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
   * Generate embeddings using Hugging Face Inference API
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
      const result = await this.hfClient.featureExtraction({
        model: this.embeddingModel,
        inputs: text,
        provider: 'hf-inference',
      });

      this.recordSuccess('huggingface');

      // The result can be a 1D array (single embedding) or 2D array (batch)
      // For single text input, we expect either number[] or number[][]
      if (Array.isArray(result)) {
        // If result is a 2D array (nested), return the first embedding
        if (Array.isArray(result[0])) {
          return result[0] as number[];
        }
        // If result is already a 1D array
        return result as number[];
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
