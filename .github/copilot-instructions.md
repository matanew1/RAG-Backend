# RAG Backend AI Agent Instructions

## Architecture Overview

This is a **NestJS-based RAG (Retrieval-Augmented Generation) system** with real-time WebSocket chat, vector database integration, LLM-powered responses, and **JWT authentication**.

**Core Architecture:**

- **API Versioning**: URI-based versioning with `/v1/` prefix on all controllers
- **JWT Authentication**: Passport-based auth with Redis token blacklisting
- **3-Layer Service Pattern**: Controller → Service → Database/LLM layers
- **Dual Communication**: REST API (`/v1/rag/*`, `/v1/auth/*`) + WebSocket (`/chat` namespace)
- **Module Structure**: `RagModule` orchestrates `LlmModule`, `VectordbModule`, `PineconeModule`, `RedisModule`, and `ElasticsearchModule`
- **Auth Module**: `AuthModule` handles JWT authentication with `UsersModule` and `RedisModule`
- **Dependency Injection**: `VectorDbService` properly injects `PineconeService` (no duplicate clients)
- **Environment Validation**: Startup validation ensures required env vars exist (see `src/config/env.validation.ts`)
- **Session Management**: ✅ Redis-backed distributed sessions with local cache for performance
- **Token Blacklisting**: ✅ Redis-backed JWT blacklist for secure logout
- **Hybrid Search**: ✅ Parallel queries to Pinecone (semantic) + Elasticsearch (keyword) for optimal retrieval
- **Production Deployment**: Nginx load balancer → 2 NestJS instances (see `docker-compose.yml`)

**Data Flow:**

1. User message → `RagGateway` (WebSocket) or `RagController` (REST)
2. `RagService` generates query embedding via `LlmService` using HuggingFace all-MiniLM-L6-v2
3. `VectorDbService` searches Pinecone for relevant context via `PineconeService` (384-dim vectors)
4. Parallel hybrid search in Elasticsearch for keyword-based results
5. `LlmService` generates response using Groq llama-3.3-70b-versatile + retrieved context
6. Response streamed back via WebSocket or returned via REST
7. Session state persisted in Redis for multi-instance support

## Critical Components

### Session Management (✅ Redis Integration Complete)

- **WebSocket sessions**: Per-client sessions created in `RagGateway.handleConnection()` (async)
- **Session storage**: Redis-backed with local cache for performance
- **Persistence**: `persistSession()` helper saves to Redis with 1-hour TTL
- **Async methods**: All session operations (create, get, clear, delete) are async
- **Multi-instance support**: Sessions shared across backend-1 and backend-2 via Redis
- **Local cache**: In-memory Map for fast reads, Redis as source of truth

### Embedding System

- **HuggingFace embeddings**: 384-dimension vectors using `sentence-transformers/all-MiniLM-L6-v2` model
- **API endpoint**: Uses `router.huggingface.co` (not deprecated `api-inference.huggingface.co`)
- **Semantic search**: High-quality embeddings for accurate retrieval
- **Pinecone index**: Must be 384 dimensions with cosine similarity metric
- **Hybrid search**: Combines Pinecone semantic search + Elasticsearch keyword search

### JWT Authentication (✅ Complete)

- **Guard-based protection**: Use `@UseGuards(JwtAuthGuard)` on protected routes
- **Token blacklisting**: Redis-backed blacklist checked on every protected request
- **Password hashing**: BCrypt with 10 salt rounds
- **Token storage**: Refresh tokens stored in Redis with TTL
- **User indexing**: Users automatically indexed in Elasticsearch on registration

**Auth Endpoints** (all under `/v1/auth/`):

```
POST /v1/auth/register  - User registration (public)
POST /v1/auth/login     - User login, returns JWT (public)
GET  /v1/auth/profile   - Get user profile (protected)
POST /v1/auth/logout    - Logout, blacklists token (protected)
GET  /v1/auth/users/search?q=query - Search users (protected)
```

**Using JwtAuthGuard**:

```typescript
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller({ path: 'example', version: '1' })
export class ExampleController {
  @UseGuards(JwtAuthGuard)
  @Get('protected')
  getProtectedData(@Request() req) {
    return { user: req.user }; // req.user contains decoded JWT payload
  }
}
```

### Caching Strategy

- **Query cache**: Query variations cached for 5 minutes (TTL in `RagService`)
- **Response cache**: Responses cached by message + instructions hash
- **Clear cache on**: Instruction updates or training data changes

## Development Workflows

### Setup & Running

```bash
# Initial setup (REQUIRED before first run)
pnpm install
npx ts-node create-index.ts  # Creates Pinecone index - MUST run once

# Development
pnpm start:dev  # Watches for changes, auto-opens browser to http://localhost:3001

# Testing
pnpm test        # Unit tests
pnpm test:e2e    # End-to-end tests with WebSocket
```

### Environment Configuration

**Required env vars** (see `src/config/rag.config.ts` for defaults):

- `GROQ_API_KEY`, `GROQ_MODEL` - LLM provider (Groq llama-3.3-70b-versatile)
- `HF_API_KEY`, `HF_EMBEDDING_MODEL` - Embedding model (HuggingFace all-MiniLM-L6-v2)
- `EMBEDDING_DIMENSION` - Vector dimension (384)
- `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` - Vector database (384 dimensions)
- `REDIS_HOST`, `REDIS_PORT` - Distributed session storage + token blacklist
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - PostgreSQL config
- `ELASTICSEARCH_URL` - Elasticsearch for hybrid search + user search
- `JWT_SECRET` - Secret key for JWT signing (required, min 32 chars)
- `JWT_EXPIRATION` - Token expiration time (default: 1h)
- `RAG_DEFAULT_INSTRUCTIONS` - System prompt for chatbot
- `RAG_TOP_K` - Number of similar documents to retrieve (default: 5)

### WebSocket Event System

**Client → Server events** (handled in `RagGateway`):

- `chat:message` - Send message with optional `streaming: boolean`
- `config:update` - Update system instructions
- `session:clear` - Clear conversation history

**Server → Client events**:

- `session:created` - Connection established with sessionId
- `chat:chunk` / `chat:end` - Streaming response chunks
- `chat:response` - Non-streaming response
- `chat:error` - Error handling

## Project-Specific Conventions

### File Organization

- **DTOs in nested folders**: `dto/chat.dto/chat.dto.ts` (not `dto/chat.dto.ts`)
- **Service tests**: `*.spec.ts` files alongside services (e.g., `pinecone.service.spec.ts`)
- **~~Guards/Filters/Interceptors~~**: ~~Under `common/` directory by type~~ **REMOVED** - Entire `src/common/` directory deleted (all files were unused)

### NestJS Patterns

- **Config injection**: Use `@nestjs/config` ConfigService, NOT direct `process.env`
  ```typescript
  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('llm.groq.apiKey');
  }
  ```
- **No decorators on services**: Guards, filters, interceptors removed (entire `src/common/` directory deleted)
- **Logger usage**: Inject `private readonly logger = new Logger(ClassName.name)` in every service

### Error Handling

- **WebSocket errors**: Emit `chat:error` event with `{ message, error }` payload
- **REST errors**: Let NestJS exception filters handle (no custom filters active)
- **Service errors**: Log with `this.logger.error()` then re-throw

### Validation

- **Global ValidationPipe**: Configured in `main.ts` with `whitelist: true`, `forbidNonWhitelisted: true`
- **DTO validation**: Use `class-validator` decorators (e.g., `@IsString()`, `@IsNotEmpty()`)

## Integration Points

### Groq + HuggingFace LLM Integration

- **Streaming**: `generateStreamingResponse()` returns `AsyncGenerator<string>` using Groq's stream API
- **Non-streaming**: `generateResponse()` returns `Promise<string>` using Groq's chat completions API
- **Chat Model**: Configurable via `GROQ_MODEL` (default: `llama-3.3-70b-versatile`)
- **Embedding Model**: Configurable via `HF_EMBEDDING_MODEL` (default: `sentence-transformers/all-MiniLM-L6-v2`)
- **Message Format**: OpenAI-compatible with `system`, `user`, `assistant` roles

### Pinecone Vector Database

- **Initialization**: `PineconeService.createIndexIfNotExists()` on app startup
- **Batch operations**: Use `trainBatch()` for multiple documents (parallel embedding generation)
- **Index verification**: Check `indexExists()` before operations

### Nginx Load Balancing

- **Upstream servers**: `rag-backend-1:3001`, `rag-backend-2:3001`
- **Proxy setup**: All requests proxied with original headers preserved
- **API routing**: Routes `/v1/rag/` and `/v1/auth/` to backend
- **WebSocket support**: Configured in CORS settings in `main.ts` and `RagGateway`
- **Session persistence**: Redis ensures sessions work across both backend instances

### Redis Integration

- **ConfigService injection**: `RedisService` uses ConfigService for config (not direct `process.env`)
- **Lifecycle management**: Implements `OnModuleDestroy` for graceful shutdown
- **Retry strategy**: Automatic reconnection with exponential backoff
- **Operations**: `set`, `get`, `del` with error handling
- **Logging**: Comprehensive logging for connection status and errors

### Elasticsearch Integration

- **Index management**: Auto-creates `rag-documents` index on startup
- **User indexing**: Users indexed in `users` index for search
- **Hybrid search**: Full-text search complements Pinecone semantic search
- **Bulk operations**: `bulkIndex()` for efficient batch document indexing
- **Schema**: Maps `content`, `metadata`, `embedding_id`, and `timestamp`
- **Search**: Multi-match queries with fuzziness for typo tolerance

## Build & Deployment

### Docker Build

```bash
# Multi-stage build: builder → production
docker-compose up  # Runs 2 backend instances + nginx
```

### Production Notes

- **Static files**: Removed - no longer serving index.html (API-only backend)
- **Logs**: Mounted at `./logs:/app/logs` in Docker containers
- **Port**: Backend runs on 3001, Nginx exposes on port 80

## Key Files Reference

- **Entry point**: `src/main.ts` - Bootstrap, Swagger setup, CORS config
- **Module root**: `src/app.module.ts` - Module imports, environment validation
- **RAG orchestration**: `src/modules/rag/rag.service.ts` - Core RAG logic with caching
- **WebSocket gateway**: `src/modules/rag/rag/rag.gateway.ts` - Real-time chat handling
- **Config schema**: `src/config/rag.config.ts` - Environment variable mappings
- **Env validation**: `src/config/env.validation.ts` - Startup validation for required env vars
- **Index creation**: `create-index.ts` - Standalone script for Pinecone setup
