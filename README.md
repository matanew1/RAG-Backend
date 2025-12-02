# RAG Backend with NestJS

A powerful Retrieval-Augmented Generation (RAG) backend built with NestJS, featuring real-time chat capabilities via WebSocket, vector database integration with Pinecone, and LLM integration with Groq.

## 🚀 Features

- **Real-time Chat**: WebSocket-based chat with streaming responses
- **Vector Database**: Pinecone integration for efficient document retrieval
- **LLM Integration**: Groq API for high-performance language model responses
- **Session Management**: Persistent chat sessions with history
- **Document Training**: Add and manage training data for the RAG system
- **RESTful API**: Complete HTTP API with Swagger documentation
- **Docker Support**: Easy deployment with Docker and Docker Compose
- **TypeScript**: Full TypeScript support with strict typing

## 📋 Prerequisites

Before running this application, make sure you have:

- **Node.js** (v18 or higher)
- **npm** or **pnpm** package manager
- **Pinecone** account and API key
- **Groq** account and API key
- **Docker** (optional, for containerized deployment)

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

   # Groq AI (get from https://console.groq.com/)
   GROQ_API_KEY=your_groq_api_key_here
   GROQ_MODEL=llama3.1-8b-instant

   # Pinecone Vector Database (get from https://app.pinecone.io/)
   PINECONE_API_KEY=your_pinecone_api_key_here
   PINECONE_ENVIRONMENT=us-west1-gcp
   PINECONE_INDEX_NAME=rag-chatbot

   # RAG Configuration
   RAG_DEFAULT_INSTRUCTIONS=You are a helpful AI assistant.
   RAG_MAX_HISTORY_LENGTH=10
   RAG_TEMPERATURE=0.7
   RAG_MAX_TOKENS=1024
   RAG_TOP_K=5
   ```

### 🔑 API Keys Setup

1. **Groq API Key:**
   - Visit [Groq Console](https://console.groq.com/)
   - Create an account and generate an API key
   - Add it to your `.env` file as `GROQ_API_KEY`

2. **Pinecone API Key:**
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
   - Create a Pinecone index named "rag-chatbot" (or your configured name)
   - Configure it with 1536 dimensions for optimal embedding storage
   - Use cosine similarity for vector matching
   - Wait for the index to be ready

2. **Manual Index Creation (Alternative):**
   - Go to your [Pinecone Dashboard](https://app.pinecone.io/)
   - Create a new index with:
     - **Name**: `rag-chatbot` (or your configured `PINECONE_INDEX_NAME`)
     - **Dimension**: `1536`
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

### Using Docker Compose (Recommended)
```bash
# Make sure your .env file has the required API keys
docker-compose up -d
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
- **Swagger UI**: http://localhost:3001/api
- **Health Check**: http://localhost:3001/rag/health

### REST API Endpoints

#### RAG Operations
- `GET /rag/health` - Health check
- `GET /rag/config` - Get current configuration
- `PUT /rag/config` - Update RAG configuration
- `POST /rag/train` - Train with single document
- `POST /rag/train/batch` - Train with multiple documents
- `POST /rag/session` - Create new chat session
- `GET /rag/session/:id` - Get session information
- `DELETE /rag/session/:id` - Delete session
- `POST /rag/session/:id/clear` - Clear session history
- `POST /rag/chat` - Send chat message (HTTP)
- `GET /rag/websocket-info` - Get WebSocket connection info

## 🌐 WebSocket Integration

Connect to the WebSocket server at: `ws://localhost:3001/chat`

### WebSocket Events

#### Incoming Events (Client → Server)

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:message` | `{ message: string, stream?: boolean, sessionId?: string }` | Send chat message |
| `config:update` | `{ instructions: string }` | Update RAG instructions |
| `session:clear` | `{ sessionId: string }` | Clear session history |
| `session:info` | `{ sessionId: string }` | Request session information |
| `admin:broadcast` | `{ message: string }` | Broadcast message to all clients |

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
| `broadcast` | `{ message: string }` | Broadcast message |
| `error` | `{ error: string }` | General error |

## 🧪 Testing

### WebSocket Testing
Open `websocket-test.html` in your browser to interactively test WebSocket functionality.

### API Testing with cURL

```bash
# Health check
curl http://localhost:3001/rag/health

# Get configuration
curl http://localhost:3001/rag/config

# Create a chat session
curl -X POST http://localhost:3001/rag/session \
  -H "Content-Type: application/json" \
  -d '{}'

# Send a chat message
curl -X POST http://localhost:3001/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, how are you?",
    "sessionId": "your-session-id"
  }'

# Train with a document
curl -X POST http://localhost:3001/rag/train \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is a sample document for training.",
    "metadata": {
      "source": "example.txt",
      "category": "documentation"
    }
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
├── main.ts                       # Application bootstrap
├── common/                       # Shared utilities
│   ├── decorators/               # Custom decorators
│   ├── filters/                  # Exception filters
│   ├── guards/                   # Authentication guards
│   ├── interceptors/             # Request/response interceptors
│   └── pipes/                    # Validation pipes
├── config/
│   └── rag.config.ts             # Configuration settings
├── modules/                      # Feature modules
│   ├── llm/                      # LLM integration
│   │   ├── llm.module.ts
│   │   ├── llm.service.ts
│   │   └── dto/
│   ├── rag/                      # RAG functionality
│   │   ├── rag.module.ts
│   │   ├── rag.service.ts
│   │   ├── rag.controller.ts
│   │   ├── rag.gateway.ts        # WebSocket gateway
│   │   └── dto/                  # Data transfer objects
│   └── vectordb/                 # Vector database
│       ├── vectordb.module.ts
│       ├── vectordb.service.ts
│       └── interfaces/
└── websocket-test.html           # WebSocket testing interface
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
| `GROQ_MODEL` | Groq model name | `llama3.1-8b-instant` | No |
| `PINECONE_API_KEY` | Pinecone API key | - | Yes |
| `PINECONE_ENVIRONMENT` | Pinecone environment | `us-west1-gcp` | No |
| `PINECONE_INDEX_NAME` | Pinecone index name | `rag-chatbot` | No |
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
   - Check your `PINECONE_INDEX_NAME` in `.env`

2. **Groq API Errors**
   - Verify your `GROQ_API_KEY` is correct
   - Check if the model name is valid (try `llama3.1-8b-instant`)

3. **WebSocket Connection Issues**
   - Ensure the server is running on the correct port
   - Check CORS settings if connecting from a different domain

4. **Build Errors**
   - Clear node_modules: `rm -rf node_modules && npm install`
   - Check TypeScript compilation: `npm run build`

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
