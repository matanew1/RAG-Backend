import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('chat_history')
export class ChatHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sessionid' })
  @Index()
  sessionId: string;

  @Column({ name: 'userid', nullable: true })
  @Index()
  userId: string;

  @Column({ type: 'enum', enum: ['user', 'assistant'] })
  role: 'user' | 'assistant';

  @Column('text')
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  context: string[];

  @Column({ name: 'responsetime', type: 'float', nullable: true })
  responseTime: number;

  @Column({ name: 'tokensused', type: 'int', nullable: true })
  tokensUsed: number;

  @CreateDateColumn({ name: 'createdat' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.chatHistories, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userid' })
  user: User;
}
