// Polyfill crypto for Node 18 compatibility with TypeORM
import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as any;
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('HTTP');

  // Enable API versioning (URI-based: /v1/rag/*)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Request logging middleware
  app.use((req, res, next) => {
    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;
      logger.log(`${method} ${originalUrl} ${statusCode} - ${duration}ms`);
    });

    next();
  });

  // Enable CORS with whitelist (security hardened)
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8080',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy violation'));
      }
    },
    credentials: true,
  });

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Setup Swagger
  const config = new DocumentBuilder()
    .setTitle('RAG Backend API')
    .setDescription(
      'API documentation for the RAG Backend with NestJS\n\n## Authentication\n\nAll endpoints except `/v1/auth/login`, `/v1/auth/register`, and `/v1/rag/health` require JWT authentication.\n\nTo authenticate:\n1. Register a new user via `POST /v1/auth/register`\n2. Login via `POST /v1/auth/login` to get an access token\n3. Click "Authorize" button above and enter: `Bearer <your_token>`\n\n## Roles\n\n- **user**: Can access chat, sessions, and config (read-only)\n- **admin**: Can also train the system, update config, and manage index\n\n## WebSocket Endpoints\n\nConnect to `ws://localhost:3001/chat` for real-time chat functionality.\n\n### Available WebSocket Events:\n\n**Outgoing Events (Server → Client):**\n- `session:created` - Session created on connection\n- `chat:start` - Chat response started (streaming)\n- `chat:chunk` - Chat response chunk (streaming)\n- `chat:end` - Chat response completed (streaming)\n- `chat:response` - Chat response (non-streaming)\n- `chat:error` - Chat error occurred\n- `config:updated` - Configuration updated\n- `session:cleared` - Session history cleared\n- `session:info` - Session information\n- `error` - General error\n\n**Incoming Events (Client → Server):**\n- `chat:message` - Send chat message\n- `config:update` - Update instructions\n- `session:clear` - Clear session history\n- `session:info` - Request session info',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Authentication operations')
    .addTag('rag', 'RAG operations')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`RAG Backend running on http://localhost:${port}`);
  console.log(`Swagger API docs available at http://localhost:${port}/api`);
  console.log(`WebSocket available at ws://localhost:${port}/chat`);
}
bootstrap();
