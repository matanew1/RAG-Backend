import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { exec } from 'child_process';
import { platform } from 'os';

function openBrowser(url: string) {
  const command = platform() === 'win32' ? `start ${url}` :
                  platform() === 'darwin' ? `open ${url}` :
                  `xdg-open ${url}`;

  exec(command, (error) => {
    if (error) {
      console.log(`❌ Could not open browser automatically: ${error.message}`);
      console.log(`📱 Please manually open: ${url}`);
    } else {
      console.log(`🌐 Browser opened automatically: ${url}`);
    }
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for WebSocket
  app.enableCors({
    origin: true, // Allow all origins for development/testing
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
      'API documentation for the RAG Backend with NestJS\n\n## WebSocket Endpoints\n\nConnect to `ws://localhost:3001/chat` for real-time chat functionality.\n\n### Available WebSocket Events:\n\n**Outgoing Events (Server → Client):**\n- `session:created` - Session created on connection\n- `chat:start` - Chat response started (streaming)\n- `chat:chunk` - Chat response chunk (streaming)\n- `chat:end` - Chat response completed (streaming)\n- `chat:response` - Chat response (non-streaming)\n- `chat:error` - Chat error occurred\n- `config:updated` - Configuration updated\n- `session:cleared` - Session history cleared\n- `session:info` - Session information\n- `broadcast` - Broadcast message\n- `error` - General error\n\n**Incoming Events (Client → Server):**\n- `chat:message` - Send chat message\n- `config:update` - Update instructions\n- `session:clear` - Clear session history\n- `session:info` - Request session info\n- `admin:broadcast` - Broadcast to all clients',
    )
    .setVersion('1.0')
    .addTag('rag', 'RAG operations')
    .addTag('websocket', 'WebSocket operations')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`RAG Backend running on http://localhost:${port}`);
  console.log(`Swagger API docs available at http://localhost:${port}/api`);
  console.log(`WebSocket available at ws://localhost:${port}/chat`);

  // Auto-open the chat interface in browser
  const chatUrl = `http://localhost:${port}`;
  openBrowser(chatUrl);
}
bootstrap();
