# RAG Backend with NestJS

A powerful Retrieval-Augmented Generation (RAG) backend built with NestJS, featuring real-time chat capabilities via WebSocket, vector database integration with Pinecone, and LLM integration with Groq + HuggingFace.

## 🚀 Features

- **Real-time Chat**: WebSocket-based chat with streaming responses via Groq llama-3.3-70b-versatile
- **JWT Authentication**: User registration, login, logout with token blacklisting via Redis
- **Role-Based Access Control (RBAC)**: User and Admin roles with guard-based protection
- **API Versioning**: All endpoints use `/v1/` prefix for future compatibility
- **Vector Database**: Pinecone integration for semantic search (384-dim embeddings, cosine similarity)
- **Hybrid Search**: Elasticsearch + Pinecone parallel queries for optimal retrieval
- **LLM Integration**: Groq (fast LLM) + HuggingFace (free embeddings via router.huggingface.co)
- **Session Management**: Redis-backed distributed sessions with 1-hour TTL and local cache
- **Persistent Storage**: PostgreSQL with TypeORM (User, Document, ChatHistory entities)
- **Triple Persistence**: All training data indexed in Pinecone + Elasticsearch + PostgreSQL
- **Monitoring**: Prometheus metrics collection with Grafana dashboards
- **Document Training**: Batch and single document training with multi-database indexing (Admin only)
- **RESTful API**: Complete HTTP API with Swagger documentation + Bearer auth
- **Load Balanced**: Nginx reverse proxy (port 8080) with round-robin distribution to 2 backend instances
- **TypeScript**: Full TypeScript support with strict typing
- **Environment Validation**: Automatic validation of required environment variables on startup

## 📋 Prerequisites

Before running this application, make sure you have:

- **Node.js** (v18 or higher)
- **npm** or **pnpm** package manager
- **Pinecone** account and API key
- **Groq** account and API key (free at https://console.groq.com)
- **HuggingFace** account and API key (free at https://huggingface.co/settings/tokens)
- **Docker** and **Docker Compose** (for full deployment with all services)

## 🛠️ Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd rag-backend
   ```

2. **Install dependencies:**
   ```bash
   # Using npm
   npm install

   # Using pnpm
   pnpm install
   ```

## ⚙️ Environment Setup

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Configure your environment variables in `.env`:**
   ```env
   # Application
   NODE_ENV=development
   PORT=3001

   # Groq AI (get from https://console.groq.com)
   GROQ_API_KEY=your_groq_api_key_here
   GROQ_MODEL=llama-3.3-70b-versatile

   # HuggingFace Embeddings (get from https://huggingface.co/settings/tokens)
   HF_API_KEY=your_huggingface_api_key_here
   HF_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
   EMBEDDING_DIMENSION=384

   # Pinecone Vector Database (get from https://app.pinecone.io/)
   PINECONE_API_KEY=your_pinecone_api_key_here
   PINECONE_ENVIRONMENT=us-east-1
   PINECONE_INDEX_NAME=rag-chatbot-384

   # Redis Configuration (distributed sessions across backend instances)
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # PostgreSQL Configuration (TypeORM persistence - User, Document, ChatHistory)
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=rag_backend
   DB_USER=raguser
   DB_PASSWORD=changeme

   # Elasticsearch Configuration (hybrid search with Pinecone)
   ELASTICSEARCH_URL=http://localhost:9200

   # JWT Authentication
   JWT_SECRET=your_super_secret_key_change_in_production
   JWT_EXPIRATION=1h

   # Grafana Configuration
   GRAFANA_PASSWORD=admin

   # RAG Configuration
   RAG_DEFAULT_INSTRUCTIONS=You are a helpful AI assistant.
   RAG_MAX_HISTORY_LENGTH=10
   RAG_TEMPERATURE=0.7
   RAG_MAX_TOKENS=1024
   RAG_TOP_K=5
   ```

### 🔑 API Keys Setup

1. **Groq API Key:**
   - Visit [Groq Console](https://console.groq.com)
   - Create an account and generate an API key (free tier available)

2. **HuggingFace API Key:**
   - Visit [HuggingFace Settings](https://huggingface.co/settings/tokens)
   - Create a read token (free)
   - Add it to your `.env` file as `HF_API_KEY`

3. **Pinecone API Key:**
   - Visit [Pinecone Console](https://app.pinecone.io/)
   - Create an account and generate an API key
   - Add it to your `.env` file as `PINECONE_API_KEY`

## 🗄️ Database Setup

The application uses Pinecone as the vector database. You need to create the required index:

1. **Automatic Index Creation:**
   ```bash
   npx ts-node create-index.ts
   ```

   This script will:
   - Create a Pinecone index named "rag-chatbot-384" (or your configured name)
   - Configure it with 384 dimensions for HuggingFace all-MiniLM-L6-v2 embeddings
   - Use cosine similarity for vector matching
   - Wait for the index to be ready

2. **Manual Index Creation (Alternative):**
   - Go to your [Pinecone Dashboard](https://app.pinecone.io/)
   - Create a new index with:
     - **Name**: `rag-chatbot-384` (or your configured `PINECONE_INDEX_NAME`)
     - **Dimension**: `384` (for HuggingFace all-MiniLM-L6-v2)
     - **Metric**: `cosine`
     - **Environment**: Your preferred region

## 🚀 Running the Application

### Development Mode
```bash
# Using npm
npm run start:dev

# Using pnpm
pnpm run start:dev
```

The application will start on `http://localhost:3001` with hot-reload enabled.

**Note**: Development mode runs a single instance. For load-balanced multi-instance setup, use Docker Compose (see below).

### Production Mode
```bash
# Build the application
npm run build

# Start production server
npm run start:prod
```

### Debug Mode
```bash
npm run start:debug
```

## 🐳 Docker Deployment

### Using Docker Compose (Recommended - Full Stack)
```bash
# Make sure your .env file has the required API keys
docker-compose up -d

# Verify all services are running
docker-compose ps

# View load balancer logs
docker-compose logs -f nginx
```

This will start:
- **2 Backend instances** (rag-backend-1 on port 3001, rag-backend-2 on port 3002)
- **Nginx** load balancer on port 8080 with round-robin distribution
- **Redis** for distributed sessions on port 6379
- **PostgreSQL** with TypeORM on port 5432
- **Elasticsearch** for hybrid search on port 9200
- **Prometheus** for metrics on port 9090
- **Grafana** for dashboards on port 3000

### Access Services
- **Application (via Nginx - RECOMMENDED)**: http://localhost:8080
- **Backend-1 (direct)**: http://localhost:3001
- **Backend-2 (direct)**: http://localhost:3002
- **Swagger API Docs**: http://localhost:8080/api
- **Grafana Dashboard**: http://localhost:3000 (admin / your_grafana_password)
- **Prometheus**: http://localhost:9090
- **Elasticsearch**: http://localhost:9200

**Important**: Always use `http://localhost:8080` for frontend integration to ensure proper load balancing across both backend instances.

### Verify Load Balancing
```powershell
# Test load distribution (PowerShell)
for ($i=1; $i -le 10; $i++) {
  curl.exe http://localhost:8080/rag/config | ConvertFrom-Json
}

# Check request distribution across backends
docker-compose logs rag-backend-1 --tail=20 | Select-String "GET /rag/config"
docker-compose logs rag-backend-2 --tail=20 | Select-String "GET /rag/config"
# Should see approximately 50% distribution to each backend
```

### Using Docker directly
```bash
# Build the image
docker build -t rag-backend .

# Run the container
docker run -p 3001:3001 --env-file .env rag-backend
```

## 📚 API Documentation

Once the application is running, visit:
- **Swagger UI**: http://localhost:8080/api (via Nginx - load balanced)
- **Health Check**: http://localhost:8080/v1/rag/health
- **Direct Backend-1**: http://localhost:3001/api (development only)
- **Direct Backend-2**: http://localhost:3002/api (development only)

### REST API Endpoints

#### Authentication (`/v1/auth/*`)
- `POST /v1/auth/register` - Register new user (public)
- `POST /v1/auth/login` - Login and get JWT token (public)
- `POST /v1/auth/logout` - Logout and blacklist token (requires auth)
- `GET /v1/auth/profile` - Get current user profile (requires auth)
- `GET /v1/auth/users/search?q=query` - Search users via Elasticsearch (requires auth)
- `GET /v1/auth/users` - List all users (admin only)
- `PATCH /v1/auth/users/:id/role` - Update user role (admin only)

#### RAG Operations (`/v1/rag/*`)
All endpoints require authentication unless marked as public.
- `GET /v1/rag/health` - Health check with dependency status (public)
- `GET /v1/rag/config` - Get current configuration (requires auth)
- `PUT /v1/rag/config` - Update RAG configuration (admin only)
- `POST /v1/rag/train` - Train with single document (admin only)
- `POST /v1/rag/train/batch` - Train with multiple documents (admin only)
- `POST /v1/rag/session` - Create new chat session (requires auth)
- `GET /v1/rag/session/:id` - Get session information (requires auth)
- `DELETE /v1/rag/session/:id` - Delete session (requires auth)
- `POST /v1/rag/session/:id/clear` - Clear session history (requires auth)
- `POST /v1/rag/chat` - Send chat message (requires auth)
- `GET /v1/rag/index` - Get Pinecone index info and statistics (admin only)
- `GET /v1/rag/index/documents` - List indexed documents (admin only)

### User Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `user` | Regular user (default) | Chat, sessions, view config |
| `admin` | Administrator | All user permissions + train system, update config, manage index, manage users |

## 🌐 WebSocket Integration

### Production (Docker Compose - Load Balanced)
Connect to the WebSocket server at: `ws://localhost:8080/chat`

### Development (Single Instance)
Connect to the WebSocket server at: `ws://localhost:3001/chat`

**Note**: When using Docker Compose, always connect via Nginx (port 8080) to ensure your WebSocket connection is load-balanced and sessions are properly managed across backend instances via Redis.

### WebSocket Events

#### Incoming Events (Client → Server)

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:message` | `{ message: string, stream?: boolean, sessionId?: string }` | Send chat message |
| `config:update` | `{ instructions: string }` | Update RAG instructions |
| `session:clear` | `{ sessionId: string }` | Clear session history |
| `session:info` | `{ sessionId: string }` | Request session information |

#### Outgoing Events (Server → Client)

| Event | Payload | Description |
|-------|---------|-------------|
| `session:created` | `{ sessionId: string }` | New session created |
| `chat:start` | `{ sessionId: string }` | Chat response started (streaming) |
| `chat:chunk` | `{ chunk: string, sessionId: string }` | Chat response chunk (streaming) |
| `chat:end` | `{ sessionId: string }` | Chat response completed (streaming) |
| `chat:response` | `{ response: string, sessionId: string }` | Complete chat response (non-streaming) |
| `chat:error` | `{ error: string, sessionId: string }` | Chat error occurred |
| `config:updated` | `{ instructions: string }` | Configuration updated |
| `session:cleared` | `{ sessionId: string }` | Session history cleared |
| `session:info` | `{ session: object }` | Session information |
| `error` | `{ error: string }` | General error |

## 🧪 Testing

### WebSocket Testing
Open `websocket-test.html` in your browser to interactively test WebSocket functionality.

### API Testing with cURL

```bash
# Health check (via Nginx load balancer)
curl http://localhost:8080/v1/rag/health

# ===== AUTHENTICATION =====

# Register a new user
curl -X POST http://localhost:8080/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "password123",
    "fullName": "John Doe"
  }'

# Login and get JWT token
curl -X POST http://localhost:8080/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "password": "password123"
  }'
# Returns: { "access_token": "eyJ...", "user": {...} }

# Get user profile (requires auth)
curl http://localhost:8080/v1/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Logout (blacklists token in Redis)
curl -X POST http://localhost:8080/v1/auth/logout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Search users via Elasticsearch (requires auth)
curl "http://localhost:8080/v1/auth/users/search?q=john&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# ===== RAG OPERATIONS =====

# Get configuration
curl http://localhost:8080/v1/rag/config

# Create a chat session
curl -X POST http://localhost:8080/v1/rag/session \
  -H "Content-Type: application/json" \
  -d '{}'

# Send a chat message
curl -X POST http://localhost:8080/v1/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, how are you?",
    "sessionId": "your-session-id"
  }'

# Train with a document (indexes in Pinecone + Elasticsearch + PostgreSQL)
curl -X POST http://localhost:8080/v1/rag/train \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is a sample document for training.",
    "metadata": {
      "source": "example.txt",
      "category": "documentation"
    }
  }'

# Train multiple documents in batch
curl -X POST http://localhost:8080/v1/rag/train/batch \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "content": "First document content",
        "metadata": {"source": "doc1.txt"}
      },
      {
        "content": "Second document content",
        "metadata": {"source": "doc2.txt"}
      }
    ]
  }'
```

### Running Unit Tests
```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run e2e tests
npm run test:e2e
```

## 🏗️ Project Structure

```
src/
├── app.module.ts                 # Main application module
├── main.ts                       # Application bootstrap with crypto polyfill
├── config/
│   ├── rag.config.ts             # Configuration settings (includes auth config)
│   └── env.validation.ts         # Environment variable validation
├── modules/                      # Feature modules
│   ├── auth/                     # JWT Authentication
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts       # Login, register, token blacklist
│   │   ├── auth.controller.ts    # /v1/auth/* endpoints
│   │   ├── dto/
│   │   │   ├── login.dto.ts
│   │   │   └── register.dto.ts
│   │   ├── guards/
│   │   │   └── jwt-auth.guard.ts # Protects routes, checks Redis blacklist
│   │   └── strategies/
│   │       └── jwt.strategy.ts   # Passport JWT strategy
│   ├── users/                    # User management
│   │   ├── users.module.ts
│   │   └── users.service.ts      # User CRUD + Elasticsearch indexing
│   ├── database/                 # PostgreSQL + TypeORM
│   │   ├── database.module.ts
│   │   └── entities/
│   │       ├── user.entity.ts    # Includes password field
│   │       ├── document.entity.ts
│   │       └── chat-history.entity.ts
│   ├── elasticsearch/            # Elasticsearch integration
│   │   ├── elasticsearch.module.ts
│   │   └── elasticsearch.service.ts
│   ├── llm/                      # Groq + HuggingFace integration
│   │   ├── llm.module.ts
│   │   └── llm.service.ts        # Uses router.huggingface.co for embeddings
│   ├── pinecone/                 # Pinecone vector database
│   │   ├── pinecone.module.ts
│   │   ├── pinecone.service.ts
│   │   └── pinecone-init.service.ts
│   ├── rag/                      # RAG functionality
│   │   ├── rag.module.ts
│   │   ├── rag.service.ts        # Core RAG logic with hybrid search
│   │   ├── rag.controller.ts     # /v1/rag/* REST endpoints
│   │   ├── rag.gateway.ts        # WebSocket gateway
│   │   ├── services/             # Extracted services
│   │   │   ├── retrieval.service.ts
│   │   │   ├── session.service.ts
│   │   │   └── training.service.ts
│   │   └── dto/                  # Data transfer objects
│   ├── redis/                    # Redis session & token blacklist
│   │   ├── redis.module.ts
│   │   └── redis.service.ts
│   └── vectordb/                 # Vector database abstraction
│       ├── vectordb.module.ts
│       ├── vectordb.service.ts
│       └── interfaces/
├── docker-compose.yml            # Multi-service orchestration
├── nginx.conf                    # Load balancer with /v1/ routing
└── create-index.ts               # Pinecone index creation script
```

## 🔧 Development

### Code Quality
```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Building
```bash
# Build for production
npm run build

# Build output will be in dist/
```

### Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `PORT` | Server port | `3001` | No |
| `GROQ_API_KEY` | Groq API key | - | Yes |
| `GROQ_MODEL` | Groq chat model | `llama-3.3-70b-versatile` | No |
| `HF_API_KEY` | HuggingFace API key | - | Yes |
| `HF_EMBEDDING_MODEL` | HuggingFace embedding model | `sentence-transformers/all-MiniLM-L6-v2` | No |
| `EMBEDDING_DIMENSION` | Embedding vector dimension | `384` | No |
| `PINECONE_API_KEY` | Pinecone API key | - | Yes |
| `PINECONE_ENVIRONMENT` | Pinecone environment | `us-east-1` | No |
| `PINECONE_INDEX_NAME` | Pinecone index name | `rag-chatbot-384` | No |
| `REDIS_HOST` | Redis host | `localhost` | No |
| `REDIS_PORT` | Redis port | `6379` | No |
| `DB_HOST` | PostgreSQL host | `localhost` | No |
| `DB_PORT` | PostgreSQL port | `5432` | No |
| `DB_NAME` | PostgreSQL database | `rag_backend` | No |
| `DB_USER` | PostgreSQL user | `raguser` | No |
| `DB_PASSWORD` | PostgreSQL password | `changeme` | Yes |
| `ELASTICSEARCH_URL` | Elasticsearch URL | `http://localhost:9200` | No |
| `GRAFANA_PASSWORD` | Grafana admin password | `admin` | No |
| `RAG_DEFAULT_INSTRUCTIONS` | Default system prompt | `"You are a helpful AI assistant."` | No |
| `RAG_MAX_HISTORY_LENGTH` | Max chat history length | `10` | No |
| `RAG_TEMPERATURE` | LLM temperature | `0.7` | No |
| `RAG_MAX_TOKENS` | Max response tokens | `1024` | No |
| `RAG_TOP_K` | Number of documents to retrieve | `5` | No |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Submit a pull request

### Development Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the UNLICENSED license.

## 🆘 Troubleshooting

### Common Issues

1. **Pinecone Index Not Found (404)**
   - Run `npx ts-node create-index.ts` to create the required index
   - Verify index dimension is 384 (for HuggingFace all-MiniLM-L6-v2)
   - Check your `PINECONE_INDEX_NAME` in `.env`

2. **LLM API Errors**
   - Verify your `GROQ_API_KEY` is correct (from https://console.groq.com)
   - Verify your `HF_API_KEY` is correct (from https://huggingface.co/settings/tokens)
   - Check Groq rate limits (30 req/min on free tier)
   - Try the HuggingFace model in their web interface first

3. **WebSocket Connection Issues**
   - Use `ws://localhost:8080/chat` for Docker Compose (via Nginx)
   - Use `ws://localhost:3001/chat` for development mode
   - Check CORS settings if connecting from a different domain
   - Verify Nginx is running: `docker-compose ps nginx`

4. **Load Balancing Not Working**
   - Ensure both backends are running: `docker-compose ps`
   - Verify Nginx is on port 8080: `curl http://localhost:8080/rag/health`
   - Check logs: `docker-compose logs nginx`
   - Test distribution: Run multiple requests and check backend logs

5. **PostgreSQL Connection Errors**
   - Verify database credentials in `.env`
   - Check if PostgreSQL container is running: `docker-compose ps postgres`
   - SSL should be disabled for Docker: Check `database.module.ts`

6. **Redis Session Issues**
   - Verify Redis is running: `docker-compose ps redis`
   - Check Redis connection: `docker-compose logs redis`
   - Sessions expire after 1 hour (configurable)

7. **Build Errors**
   - Clear node_modules: `rm -rf node_modules && pnpm install`
   - Check TypeScript compilation: `pnpm run build`
   - Verify Node.js version: `node --version` (requires v18+)

## 🚀 Deployment

### Render Deployment

1. **Connect to Render:**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Web Service"
   - Connect your GitHub repository

2. **Configure Build Settings:**
   - **Runtime**: Node
   - **Build Command**: `pnpm install && pnpm build`
   - **Start Command**: `pnpm start:prod`

3. **Environment Variables:**
   In Render Dashboard → Environment:
   ```
   NODE_ENV=production
   PORT=10000
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_ENVIRONMENT=us-west1-gcp
   PINECONE_INDEX_NAME=rag-chatbot
   RAG_DEFAULT_INSTRUCTIONS=You are a helpful AI assistant.
   RAG_MAX_HISTORY_LENGTH=10
   RAG_TEMPERATURE=0.7
   RAG_MAX_TOKENS=1024
   RAG_TOP_K=5
   ```
   
   **Or use the render.yaml file** which will automatically configure these during deployment.

4. **Deploy:**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Your app will be available at: `https://your-service-name.onrender.com`

5. **Access Your App:**
   - **Frontend**: `https://your-service-name.onrender.com/` (serves `index.html`)
   - **API Docs**: `https://your-service-name.onrender.com/api`
   - **WebSocket**: `wss://your-service-name.onrender.com/chat`

### Alternative Deployment Options

#### Docker Deployment
```bash
# Build and run with Docker
docker build -t rag-backend .
docker run -p 3001:3001 --env-file .env rag-backend
```

#### Railway, Fly.io, or Vercel
Similar configuration to Render - use the same build/start commands and environment variables.

### Getting Help

- Check the [Issues](https://github.com/your-repo/issues) page
- Review the Swagger documentation at `/api`
- Test with the provided `websocket-test.html`

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the code examples
