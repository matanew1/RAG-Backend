// modules/pinecone/pinecone.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PineconeService } from './pinecone.service';

describe('PineconeService', () => {
  let service: PineconeService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PineconeService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'vectorDb.pinecone.apiKey': 'test-api-key',
                'vectorDb.pinecone.indexName': 'test-index',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PineconeService>(PineconeService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get index name', () => {
    expect(service.getIndexName()).toBe('test-index');
  });

  // Note: Full integration tests would require actual Pinecone credentials
  // These are unit test stubs for the service structure
});
