import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, Document, ChatHistory } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST') || 'localhost',
        port: configService.get<number>('DB_PORT') || 5432,
        username: configService.get<string>('DB_USER') || 'raguser',
        password: configService.get<string>('DB_PASSWORD') || 'changeme',
        database: configService.get<string>('DB_NAME') || 'rag_backend',
        entities: [User, Document, ChatHistory],
        synchronize: true, // Auto-create tables
        logging: false,
        ssl: false, // Disable SSL for local PostgreSQL
      }),
    }),
    TypeOrmModule.forFeature([User, Document, ChatHistory]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
