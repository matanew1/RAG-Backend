// modules/llm/llm.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private groq: Groq;

  constructor(private configService: ConfigService) {
    const groqApiKey = this.configService.get<string>('llm.groq.apiKey');
    this.groq = new Groq({
      apiKey: groqApiKey!,
    });
  }

  /**
   * Generate embeddings for text using improved hash-based approach
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Improved hash-based embeddings with better semantic capture
    const embedding = new Array(1536).fill(0);

    // Process text with better tokenization
    const tokens = this.tokenize(text);

    tokens.forEach((token, idx) => {
      const hash = this.improvedHash(token);
      const position = Math.abs(hash) % 1536;

      // Add positional encoding for better semantic understanding
      const positionWeight = Math.sin(idx / 100); // Simple positional encoding
      embedding[position] += (1 + positionWeight) * this.getTokenWeight(token);
    });

    // Normalize the embedding
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => val / (norm || 1));
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
      const allMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

      const response = await this.groq.chat.completions.create({
        model: this.configService.get<string>('llm.groq.model')!,
        messages: allMessages as any,
        max_tokens: this.configService.get<number>('rag.maxTokens')!,
        temperature,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      this.logger.error('LLM generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate streaming response
   */
  async *generateStreamingResponse(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    temperature: number = 0.7,
  ): AsyncGenerator<string> {
    try {
      const allMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

      const stream = await this.groq.chat.completions.create({
        model: this.configService.get<string>('llm.groq.model')!,
        messages: allMessages as any,
        max_tokens: this.configService.get<number>('rag.maxTokens')!,
        temperature,
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

  private tokenize(text: string): string[] {
    // Simple tokenization - split on whitespace and punctuation
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }

  private improvedHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  private getTokenWeight(token: string): number {
    // Give higher weight to meaningful tokens
    if (token.length < 3) return 0.5; // Short tokens get less weight
    if (/^\d+$/.test(token)) return 0.7; // Numbers get moderate weight
    if (token.length > 10) return 1.2; // Longer tokens get higher weight
    return 1.0; // Default weight
  }
}
