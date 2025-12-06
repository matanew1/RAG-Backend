import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from '../database/entities/user.entity';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), ElasticsearchModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
