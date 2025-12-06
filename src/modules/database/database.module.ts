import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, Document, ChatHistory, Conversation } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<string>('NODE_ENV') === 'production';
        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST') || 'localhost',
          port: configService.get<number>('DB_PORT') || 5432,
          username: configService.get<string>('DB_USER') || 'raguser',
          password: configService.get<string>('DB_PASSWORD') || 'changeme',
          database: configService.get<string>('DB_NAME') || 'rag_backend',
          entities: [User, Document, ChatHistory, Conversation],
          synchronize: !isProduction, // Disable auto-sync in production - use migrations
          logging: !isProduction,
          ssl: false, // Disable SSL for local PostgreSQL
          // Connection pool configuration
          extra: {
            max: 20, // Max pool size
            min: 5, // Min pool size
            idleTimeoutMillis: 30000, // Close idle connections after 30s
          },
        };
      },
    }),
    TypeOrmModule.forFeature([User, Document, ChatHistory, Conversation]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
