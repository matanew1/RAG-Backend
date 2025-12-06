import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ name: 'embeddingid', nullable: true })
  @Index()
  embeddingId: string;

  @Column({ nullable: true })
  source: string;

  @Column({ type: 'float', nullable: true })
  score: number;

  @Column({ name: 'isactive', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'createdat' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedat' })
  updatedAt: Date;

  @Column({ name: 'indexedat', type: 'timestamp', nullable: true })
  indexedAt: Date;
}
