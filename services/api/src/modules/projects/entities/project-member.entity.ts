import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../permissions/entities/role.entity';

@Entity('project_members')
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50, default: 'developer' })
  role: string;

  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId: string | null;

  @ManyToOne(() => Role, { nullable: true, eager: true })
  @JoinColumn({ name: 'role_id' })
  assignedRole: Role;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
