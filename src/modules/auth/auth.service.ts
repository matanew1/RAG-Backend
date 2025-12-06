import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly TOKEN_BLACKLIST_PREFIX = 'blacklist:token:';
  private readonly REFRESH_TOKEN_PREFIX = 'refresh:token:';

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (user && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { username: user.username, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findOne(registerDto.username);
    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    const { password, ...result } = user;
    return result;
  }

  /**
   * Blacklist a JWT token (for logout)
   * Token will be stored in Redis until it expires
   */
  async blacklistToken(token: string): Promise<void> {
    try {
      const decoded = this.jwtService.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return;
      }

      // Calculate TTL until token expires
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redisService.set(
          `${this.TOKEN_BLACKLIST_PREFIX}${token}`,
          { blacklistedAt: new Date().toISOString() },
          ttl,
        );
      }
    } catch (error) {
      // Token might be invalid, ignore
    }
  }

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    const result = await this.redisService.get(`${this.TOKEN_BLACKLIST_PREFIX}${token}`);
    return result !== null;
  }

  /**
   * Store refresh token in Redis
   */
  async storeRefreshToken(
    userId: string,
    refreshToken: string,
    ttl: number = 604800,
  ): Promise<void> {
    await this.redisService.set(
      `${this.REFRESH_TOKEN_PREFIX}${userId}`,
      { token: refreshToken, createdAt: new Date().toISOString() },
      ttl, // Default 7 days
    );
  }

  /**
   * Invalidate refresh token (for logout)
   */
  async invalidateRefreshToken(userId: string): Promise<void> {
    await this.redisService.del(`${this.REFRESH_TOKEN_PREFIX}${userId}`);
  }

  /**
   * Validate refresh token
   */
  async validateRefreshToken(userId: string, token: string): Promise<boolean> {
    const stored = await this.redisService.get<{ token: string }>(
      `${this.REFRESH_TOKEN_PREFIX}${userId}`,
    );
    return stored?.token === token;
  }
}
