// modules/llm/llm.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private groq: Groq;

  // Cache config values to avoid repeated lookups
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly maxTokens: number;
  private readonly hfApiKey: string;

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
   * Generate embeddings using Hugging Face Inference API (free)
   * Using all-MiniLM-L6-v2 which outputs 384-dimensional vectors
   */
  async generateEmbedding(text: string): Promise<number[]> {
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
        throw new Error(`Hugging Face API error: ${response.status} - ${errorText}`);
      }

      const embedding = await response.json();

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

      return response.choices[0]?.message?.content || '';
    } catch (error) {
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
    } catch (error) {
      this.logger.error('Streaming generation failed:', error);
      throw error;
    }
  }
}
