import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ChatHistory } from './chat-history.entity';
import { Role } from '../../auth/enums/role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column({ name: 'fullname', nullable: true })
  fullName: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: Role.USER,
  })
  role: Role;

  @Column({ name: 'isactive', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'createdat' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedat' })
  updatedAt: Date;

  @OneToMany(() => ChatHistory, (chatHistory) => chatHistory.user)
  chatHistories: ChatHistory[];
}
