// src/modules/redis/redis.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private isConnected = false;
  private readonly host: string;
  private readonly port: number;

  constructor(private configService: ConfigService) {
    this.host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    this.port = this.configService.get<number>('REDIS_PORT') || 6379;
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.client = new Redis({
      host: this.host,
      port: this.port,
      password: password || undefined, // Optional Redis authentication
      retryStrategy: (times) => {
        if (times > 30) {
          this.logger.error('Redis max retries exceeded, giving up');
          return null;
        }
        // Exponential backoff with max 5 seconds
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      maxRetriesPerRequest: 10,
      enableReadyCheck: true,
      connectTimeout: 20000,
      keepAlive: 30000,
      enableOfflineQueue: true,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.logger.log(`Connecting to Redis at ${this.host}:${this.port}...`);
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      this.logger.log(`✅ Redis ready at ${this.host}:${this.port}`);
    });

    this.client.on('error', (error: Error & { code?: string }) => {
      // Suppress transient connection errors during startup/reconnection
      const transientErrors = ['EPIPE', 'ECONNRESET', 'ENOTCONN', 'ECONNREFUSED', 'ETIMEDOUT'];
      if (transientErrors.some((e) => error.code === e || error.message?.includes(e))) {
        // Only log as debug - these are expected during reconnection
        if (!this.isConnected) {
          return;
        }
        this.logger.debug(`Redis transient error: ${error.code || error.message}`);
      } else {
        this.logger.error(`Redis error: ${error.message}`);
      }
    });

    this.client.on('close', () => {
      if (this.isConnected) {
        this.isConnected = false;
        this.logger.warn('Redis connection closed');
      }
    });

    this.client.on('reconnecting', (delay: number) => {
      this.logger.log(`Reconnecting to Redis in ${delay}ms...`);
    });

    this.client.on('end', () => {
      this.isConnected = false;
      this.logger.warn('Redis connection ended');
    });
  }

  async onModuleInit(): Promise<void> {
    // Wait for connection with timeout
    await this.waitForConnection(30000);
  }

  private async waitForConnection(timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    while (!this.isConnected && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (this.isConnected) {
      this.logger.log('✅ Redis connection established successfully');
    } else {
      this.logger.warn('Redis connection timeout - will continue with offline queue');
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      this.logger.error(`Failed to set key ${key}: ${error.message}`);
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.logger.error(`Failed to get key ${key}: ${error.message}`);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Failed to delete key ${key}:`, error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis connection closed');
  }

  /**
   * Health check for Redis connectivity
   */
  async isHealthy(): Promise<{ healthy: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.client.ping();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}
