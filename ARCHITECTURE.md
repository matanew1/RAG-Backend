# RAG Backend Architecture - Groq + HuggingFace Integration

## System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    NGINX Load Balancer                           │
│                     (Port 8080 → 80)                             │
│              Round-Robin Load Distribution                       │
└──────────────────┬──────────────────┬────────────────────────────┘
                   │                  │
         ┌─────────▼────────┐  ┌─────▼────────────┐
         │  Backend Instance │  │ Backend Instance │
         │  rag-backend-1    │  │  rag-backend-2   │
         │ (Port 3001/3001)  │  │ (Port 3002/3001) │
         │  NestJS + WS      │  │  NestJS + WS     │
         └─────────┬─────────┘  └──────┬───────────┘
                   │                   │
         ┌─────────┴───────────────────┴──────────┐
         │        Shared Resource Layer           │
         │                                         │
    ┌────▼────┐  ┌──────────┐  ┌──────────┐  ┌───▼────────┐
    │  Redis  │  │PostgreSQL│  │Pinecone  │  │Elasticsearch│
    │Sessions │  │TypeORM DB│  │  Vector  │  │Hybrid Search│
    │& Cache  │  │  Users   │  │  384-d   │  │Full-Text   │
    │  :6379  │  │Documents │  │Embeddings│  │  Index     │
    │         │  │ChatHistory│  │Cosine    │  │ Fuzzy      │
    └─────────┘  └──────────┘  └──────────┘  └─────────────┘
         │             │             │              │
    ┌────▼─────────────▼─────────────▼──────────────▼────┐
    │                                                      │
    │         AI API Layer (Free & Stable)                │
    │  ┌──────────────┐  ┌──────────────────────────┐   │
    │  │ HuggingFace  │  │      Groq (Fast LLM)     │   │
    │  │all-MiniLM-L6 │  │   llama-3.3-70b-versatile│   │
    │  │  v2 (384-d)  │  │    w/ Chat History       │   │
    │  └──────────────┘  └──────────────────────────┘   │
    └──────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────┐
    │           Monitoring & Observability               │
    │  ┌──────────────┐         ┌──────────────┐       │
    │  │  Prometheus  │────────▶│   Grafana    │       │
    │  │    :9090     │         │    :3000     │       │
    │  │   Metrics    │         │  Dashboards  │       │
    │  └──────────────┘         └──────────────┘       │
    └────────────────────────────────────────────────────┘
```

## Component Descriptions

### 1. **Load Balancer (Nginx)**
- **Port**: 8080 (external) → 80 (internal container)
- **Algorithm**: Round-robin distribution between backend instances
- **WebSocket Support**: Handles connection upgrades for real-time chat
- **Single Entry Point**: All frontend requests go through Nginx
- **Load Distribution**: Confirmed working - evenly distributes requests
- **Production**: Use port 443 with SSL termination in production

### 2. **Backend Instances (NestJS)**
- **rag-backend-1** (Port 3001) and **rag-backend-2** (Port 3002): Identical instances
- **REST API**: `/rag/*` endpoints for RAG operations
- **WebSocket Gateway**: `/chat` namespace for real-time streaming
- **Stateless Design**: Sessions stored in Redis for horizontal scaling
- **Shared Resources**: Both instances share Redis, PostgreSQL, Elasticsearch, Pinecone
- **Load Balanced**: Traffic automatically distributed by Nginx

### 3. **Redis Cache & Session Store**
- **Distributed Sessions**: WebSocket sessions shared across both backend instances
- **Session TTL**: 1-hour expiration with automatic cleanup
- **Local Cache**: In-memory Map for fast reads + Redis as source of truth
- **Query Caching**: Query variations cached for 5 minutes
- **Response Caching**: Responses cached by message + instruction hash
- **Operations**: Async methods - get, set, del, exists, keys

### 4. **PostgreSQL Database**
- **TypeORM Integration**: Auto-sync tables with entities
- **Entities**: User, Document, ChatHistory with UUID primary keys
- **Chat History**: Persists all conversations with sessionId, role, content, context
- **Document Storage**: Full content + metadata (jsonb) + embeddingId (indexed)
- **User Management**: Username, email, timestamps, chat history relations
- **SSL**: Disabled for Docker networking (enable in production)

### 5. **Pinecone Vector Database**
- **Index**: `rag-chatbot-384` with 384 dimensions
- **Embeddings**: HuggingFace `sentence-transformers/all-MiniLM-L6-v2` model
- **Similarity**: Cosine similarity metric
- **Search**: Fast k-nearest neighbor retrieval (configurable RAG_TOP_K)
- **Metadata**: Stores original content alongside vectors
- **Initialization**: Auto-creates index on first startup via `create-index.ts`

### 6. **Elasticsearch**
- **Index**: `rag-documents` with custom mapping
- **Hybrid Search**: Parallel queries with Pinecone for best results
- **Full-Text**: Multi-match queries with fuzziness for typo tolerance
- **Schema**: content (text), metadata (object), embeddingId (keyword), timestamp
- **Bulk Operations**: Efficient batch indexing for training data
- **Complements**: Semantic search from Pinecone with keyword matching

### 7. **AI Providers**

#### Groq (LLM - Chat/Streaming)
- **Model**: `llama-3.3-70b-versatile` (free tier)
- **Features**: Ultra-fast inference, streaming support
- **Rate Limits**: 30 requests/min on free tier
- **Use Case**: Response generation with chat history

#### HuggingFace (Embeddings)
- **Model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Dimensions**: 384 (optimized for speed and quality)
- **API**: Free Inference API with `wait_for_model` option
- **Use Case**: Converting text to semantic vectors

### 8. **Monitoring Stack**
- **Prometheus**: Metrics collection from all services
- **Grafana**: Visualization dashboards
- Real-time performance monitoring
- Alert management

## Data Flow

### RAG Query Flow (Complete Integration)
```
1. User sends message via WebSocket/REST → http://localhost:8080
   ↓
2. Nginx load balancer routes to Backend-1 OR Backend-2 (round-robin)
   ↓
3. Backend retrieves session from Redis (shared across instances)
   ↓
4. Backend generates query embedding using HuggingFace all-MiniLM-L6-v2
   ↓
5. Parallel hybrid search:
   ├─ Pinecone: Semantic vector similarity (384-d cosine)
   └─ Elasticsearch: Full-text keyword matching (fuzzy)
   ↓
6. Results merged and ranked by relevance scores
   ↓
7. Context + Chat History + Query sent to Groq llama-3.3-70b-versatile
   ↓
8. Streaming response chunks sent back to user via WebSocket
   ↓
9. Triple persistence:
   ├─ Redis: Session state updated (1-hour TTL)
   ├─ PostgreSQL: Chat history saved to database (permanent)
   └─ Local cache: In-memory for fast subsequent reads
```

### Training Data Flow (Multi-Database Persistence)
```
1. POST /rag/train or /rag/train/batch → http://localhost:8080/rag/train
   ↓
2. Nginx routes to available backend instance
   ↓
3. Backend generates embeddings via HuggingFace all-MiniLM-L6-v2
   ↓
4. Triple parallel storage (Promise.all):
   ├─ Pinecone: Upsert vector embeddings (384-dim) + metadata
   ├─ Elasticsearch: Bulk index content + embeddingId + timestamp
   └─ PostgreSQL: INSERT Document entity (content, metadata jsonb, embeddingId)
   ↓
5. All three databases synchronized with same embeddingId
   ↓
6. Cache invalidation in Redis (clear query cache)
   ↓
7. Success response with embeddingId returned
```

## Module Architecture

### NestJS Module Structure
```
AppModule
├── ConfigModule (Global)
│   ├── rag.config.ts (Groq, HuggingFace, Pinecone configs)
│   └── env.validation.ts (Startup validation)
├── RagModule
│   ├── RagService (Orchestration layer)
│   ├── RagController (REST endpoints)
│   └── RagGateway (WebSocket gateway)
├── LlmModule
│   └── LlmService (Groq + HuggingFace integration)
├── VectorDbModule
│   └── VectorDbService (Pinecone wrapper)
├── PineconeModule
│   ├── PineconeService (Client management)
│   └── PineconeInitService (Index setup)
├── RedisModule
│   └── RedisService (Cache & sessions)
└── ElasticsearchModule
    └── ElasticsearchService (Hybrid search)
```

## Key Design Patterns

### 1. **Service Layer Pattern**
- **Controller → Service → Database** separation
- Controllers handle HTTP/WebSocket
- Services contain business logic
- Database modules handle data persistence

### 2. **Dependency Injection**
- ConfigService injected everywhere (no direct `process.env`)
- Proper module encapsulation
- Testable components

### 3. **Singleton Pattern**
- Groq client: Single instance per backend
- Pinecone client: Managed lifecycle
- Redis client: Connection pooling
- Elasticsearch client: Shared instance

### 4. **Strategy Pattern**
- Hybrid search: Combine semantic + keyword results
- Multi-model support (easy to swap LLM providers)

### 5. **Observer Pattern**
- WebSocket events for real-time updates
- Session lifecycle events
- Metrics emission to Prometheus

## Scalability Considerations

### Horizontal Scaling
- ✅ Stateless backend instances
- ✅ Redis for shared sessions
- ✅ Load balancer distribution
- ⚠️ WebSocket sticky sessions (configure Nginx if needed)

### Vertical Scaling
- Cohere API rate limits (check tier)
- Pinecone index pod size
- Elasticsearch heap size
- PostgreSQL connection pool

### Performance Optimization
- **Caching**: Redis TTL caching reduces LLM calls
- **Batch Operations**: Bulk training reduces API calls
- **Parallel Queries**: Pinecone + Elasticsearch searched concurrently
- **Streaming**: Real-time responses improve UX

## Security Measures

### API Key Management
- All keys in environment variables
- Never committed to version control
- Validated on startup

### Rate Limiting
- Throttler: 10 requests per 60 seconds
- Per-IP rate limiting via Nginx (configurable)

### Data Validation
- DTOs with class-validator
- Global validation pipe
- Input sanitization

## Monitoring & Observability

### Metrics Collected
- Request latency (p50, p95, p99)
- Error rates by endpoint
- Cache hit/miss ratios
- LLM API response times
- Vector search latencies
- Active WebSocket connections

### Health Checks
- `/rag/health` endpoint
- Redis connection status
- PostgreSQL connection status
- Elasticsearch cluster health
- Pinecone index availability

## Deployment Strategy

### Development
```bash
# Initial setup
pnpm install
npx ts-node create-index.ts  # Creates Pinecone index (REQUIRED once)

# Start development server
pnpm start:dev  # Single instance on port 3001
# Access: http://localhost:3001
```

### Production (Docker Compose)
```bash
# Start full stack
docker-compose up -d
# Services: 2 backends + nginx + redis + postgres + elasticsearch + prometheus + grafana

# Verify services
docker-compose ps  # Check all containers running
docker-compose logs -f nginx  # Watch load balancer logs

# Access points
# - Frontend API: http://localhost:8080 (load balanced)
# - Backend-1: http://localhost:3001 (direct)
# - Backend-2: http://localhost:3002 (direct)
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:3000
```

### Load Balancing Verification
```bash
# Test load distribution (PowerShell)
for ($i=1; $i -le 10; $i++) {
  curl.exe http://localhost:8080/rag/config | ConvertFrom-Json
}

# Check backend logs for request distribution
docker-compose logs rag-backend-1 --tail=20 | Select-String "GET /rag/config"
docker-compose logs rag-backend-2 --tail=20 | Select-String "GET /rag/config"
# Should see ~50% distribution to each backend
```

### Cloud Deployment Options
- **AWS**: ECS + RDS + ElastiCache + OpenSearch
- **GCP**: Cloud Run + Cloud SQL + Memorystore
- **Azure**: Container Instances + PostgreSQL + Redis Cache
- **Kubernetes**: Helm chart with auto-scaling

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `GROQ_API_KEY` | Groq API key | Required |
| `GROQ_MODEL` | Chat model | `llama-3.3-70b-versatile` |
| `HF_API_KEY` | HuggingFace API key | Required |
| `HF_EMBEDDING_MODEL` | Embedding model | `sentence-transformers/all-MiniLM-L6-v2` |
| `EMBEDDING_DIMENSION` | Vector dimension | `384` |
| `PINECONE_API_KEY` | Pinecone API key | Required |
| `PINECONE_INDEX_NAME` | Pinecone index name | `rag-chatbot-384` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `ELASTICSEARCH_URL` | Elasticsearch URL | `http://localhost:9200` |

## Migration from Cohere to Groq + HuggingFace

### Changes Summary
1. **LLM Provider**: Cohere → Groq (free, fast)
2. **Embedding Provider**: Cohere → HuggingFace (free)
3. **Embedding Dimensions**: 1024 → 384
4. **Chat API**: Cohere chat → Groq OpenAI-compatible
5. **Streaming**: Cohere chatStream → Groq stream

### Migration Steps
1. Update environment variables (`.env`)
2. Delete old Pinecone index or create new one with 384 dimensions
3. Retrain all documents to generate HuggingFace embeddings
4. Test chat functionality with Groq model
5. Monitor performance and adjust parameters

### Why This Migration?
- **Stability**: Cohere SDK had recurring "fetch failed" errors
- **Cost**: Both Groq and HuggingFace offer free tiers
- **Speed**: Groq offers extremely fast inference
- **Reliability**: More stable API connections

## Current Status ✅

- [x] Groq AI integration (llama-3.3-70b-versatile)
- [x] HuggingFace embeddings (all-MiniLM-L6-v2, 384-d)
- [x] PostgreSQL TypeORM integration with entities (User, Document, ChatHistory)
- [x] Redis distributed sessions with local cache
- [x] Elasticsearch hybrid search (parallel with Pinecone)
- [x] Nginx load balancing (round-robin, port 8080)
- [x] Two backend instances with shared resources
- [x] WebSocket real-time chat with session persistence
- [x] Triple-database persistence (Pinecone + Elasticsearch + PostgreSQL)
- [x] Chat history saved to PostgreSQL
- [x] Prometheus + Grafana monitoring stack
- [x] Docker Compose production setup

## Future Enhancements

- [ ] Redis pub/sub for cross-instance real-time events
- [ ] Elasticsearch advanced analyzers (multi-language support)
- [ ] Custom Grafana dashboards for RAG metrics
- [ ] Prometheus Alertmanager integration
- [ ] Multi-tenant support with user authentication
- [ ] Advanced RAG strategies (HyDE, reranking, query expansion)
- [ ] SSL/TLS termination in Nginx
- [ ] Rate limiting per user
- [ ] Document versioning in PostgreSQL
- [ ] Backup and disaster recovery automation
