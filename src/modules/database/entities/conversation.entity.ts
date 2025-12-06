import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { ChatHistory } from './chat-history.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userid' })
  @Index()
  userId: string;

  @Column({ default: 'New Conversation' })
  title: string;

  @Column({ name: 'lastmessage', type: 'text', nullable: true })
  lastMessage: string;

  @Column({ name: 'messagecount', type: 'int', default: 0 })
  messageCount: number;

  @Column({ name: 'isarchived', default: false })
  isArchived: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'createdat' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedat' })
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userid' })
  user: User;

  @OneToMany(() => ChatHistory, (chatHistory) => chatHistory.conversation)
  messages: ChatHistory[];
}
