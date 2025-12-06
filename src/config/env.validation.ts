import { plainToClass } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsNumber, validateSync } from 'class-validator';

class EnvironmentVariables {
  // Groq LLM Configuration
  @IsString()
  @IsNotEmpty()
  GROQ_API_KEY: string;

  @IsString()
  @IsOptional()
  GROQ_MODEL?: string;

  // HuggingFace Embedding Configuration
  @IsString()
  @IsNotEmpty()
  HF_API_KEY: string;

  @IsString()
  @IsOptional()
  HF_EMBEDDING_MODEL?: string;

  @IsNumber()
  @IsOptional()
  EMBEDDING_DIMENSION?: number;

  // Pinecone Configuration
  @IsString()
  @IsNotEmpty()
  PINECONE_API_KEY: string;

  @IsString()
  @IsOptional()
  PINECONE_INDEX_NAME?: string;

  @IsString()
  @IsOptional()
  PINECONE_ENVIRONMENT?: string;

  // RAG Configuration
  @IsString()
  @IsOptional()
  RAG_DEFAULT_INSTRUCTIONS?: string;

  @IsNumber()
  @IsOptional()
  RAG_MAX_HISTORY_LENGTH?: number;

  // Auth Configuration
  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRATION?: string;

  @IsNumber()
  @IsOptional()
  RAG_TEMPERATURE?: number;

  @IsNumber()
  @IsOptional()
  RAG_MAX_TOKENS?: number;

  @IsNumber()
  @IsOptional()
  RAG_TOP_K?: number;

  // General Configuration
  @IsString()
  @IsOptional()
  NODE_ENV?: string;

  @IsNumber()
  @IsOptional()
  PORT?: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const missingVars = errors.map((err) => Object.keys(err.constraints || {}).join(', '));
    throw new Error(
      `❌ Environment validation failed!\n\nMissing or invalid variables:\n${errors
        .map((err) => `  - ${err.property}: ${Object.values(err.constraints || {}).join(', ')}`)
        .join('\n')}\n\nPlease check your .env file and ensure all required variables are set.`,
    );
  }

  return validatedConfig;
}
