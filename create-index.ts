import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export async function createIndex() {
  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    const indexName = process.env.PINECONE_INDEX_NAME || 'rag-chatbot';

    console.log(`Creating Pinecone index: ${indexName}`);

    // Create index with 384 dimensions (matching sentence-transformers/all-MiniLM-L6-v2 embedding size)
    const dimension = parseInt(process.env.EMBEDDING_DIMENSION || '384', 10);
    await pinecone.createIndex({
      name: indexName,
      dimension: dimension,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    });

    console.log(`✅ Index "${indexName}" created successfully!`);
    console.log('⏳ Waiting for index to be ready...');

    // Wait for index to be ready
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!isReady && attempts < maxAttempts) {
      try {
        const index = pinecone.index(indexName);
        await index.describeIndexStats();
        isReady = true;
        console.log('✅ Index is ready!');
      } catch (error) {
        attempts++;
        console.log(`⏳ Waiting... (${attempts}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
      }
    }

    if (!isReady) {
      console.log('⚠️ Index creation may still be in progress. Please wait a few more minutes.');
    }
  } catch (error) {
    console.error('❌ Error creating index:', error);
  }
}
