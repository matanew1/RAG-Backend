import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { RegisterDto } from '../auth/dto/register.dto';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly ES_USER_INDEX = 'users';

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private elasticsearchService: ElasticsearchService,
  ) {}

  async findOne(username: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { username },
      select: [
        'id',
        'username',
        'email',
        'password',
        'isActive',
        'fullName',
        'role',
        'createdAt',
        'updatedAt',
      ],
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  /**
   * Find all users with pagination (Admin use)
   */
  async findAll(limit: number = 50, offset: number = 0): Promise<User[]> {
    return this.usersRepository.find({
      take: limit,
      skip: offset,
      select: ['id', 'username', 'email', 'fullName', 'role', 'isActive', 'createdAt', 'updatedAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async create(registerDto: RegisterDto): Promise<User> {
    const user = this.usersRepository.create(registerDto);
    const savedUser = await this.usersRepository.save(user);

    // Index user in Elasticsearch for search
    try {
      await this.indexUserInElasticsearch(savedUser);
    } catch (error) {
      this.logger.warn(`Failed to index user in Elasticsearch: ${error.message}`);
      // Don't fail user creation if ES indexing fails
    }

    return savedUser;
  }

  /**
   * Index a user in Elasticsearch for search capabilities
   */
  private async indexUserInElasticsearch(user: User): Promise<void> {
    await this.elasticsearchService.indexDocument(
      user.id,
      `${user.username} ${user.email} ${user.fullName || ''}`,
      {
        type: 'user',
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    );
    this.logger.log(`Indexed user ${user.username} (role: ${user.role}) in Elasticsearch`);
  }

  /**
   * Search users via Elasticsearch
   */
  async searchUsers(query: string, limit: number = 10): Promise<any[]> {
    try {
      const results = await this.elasticsearchService.search(query, limit);
      // Filter to only user-type documents
      return results.filter((r: any) => r.metadata?.type === 'user');
    } catch (error) {
      this.logger.error(`User search failed: ${error.message}`);
      // Fallback to database search
      return this.fallbackSearch(query, limit);
    }
  }

  /**
   * Fallback search using database ILIKE query
   */
  private async fallbackSearch(query: string, limit: number): Promise<User[]> {
    return this.usersRepository.find({
      where: [
        { username: ILike(`%${query}%`) },
        { email: ILike(`%${query}%`) },
        { fullName: ILike(`%${query}%`) },
      ],
      take: limit,
      select: ['id', 'username', 'email', 'fullName', 'role', 'isActive', 'createdAt'],
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: Partial<User>): Promise<User | null> {
    await this.usersRepository.update(userId, updates);
    const updatedUser = await this.findById(userId);

    // Re-index in Elasticsearch
    if (updatedUser) {
      try {
        await this.indexUserInElasticsearch(updatedUser);
      } catch (error) {
        this.logger.warn(`Failed to re-index user in Elasticsearch: ${error.message}`);
      }
    }

    return updatedUser;
  }
}
