export default () => ({
  rag: {
    defaultInstructions: process.env.RAG_DEFAULT_INSTRUCTIONS || 'You are a helpful AI assistant.',
    maxHistoryLength: parseInt(process.env.RAG_MAX_HISTORY_LENGTH || '10'),
    temperature: parseFloat(process.env.RAG_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.RAG_MAX_TOKENS || '1024'),
    topK: parseInt(process.env.RAG_TOP_K || '5'),
  },
  vectorDb: {
    provider: 'pinecone',
    pinecone: {
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONMENT,
      indexName: process.env.PINECONE_INDEX_NAME || 'rag-index',
    },
  },
  llm: {
    provider: 'groq',
    groq: {
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'llama3.1-8b-instant',
    },
  },
});
