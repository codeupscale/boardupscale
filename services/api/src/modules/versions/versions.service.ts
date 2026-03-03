import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Version } from './entities/version.entity';
import { IssueVersion } from './entities/issue-version.entity';
import { CreateVersionDto } from './dto/create-version.dto';
import { UpdateVersionDto } from './dto/update-version.dto';

@Injectable()
export class VersionsService {
  constructor(
    @InjectRepository(Version)
    private versionRepository: Repository<Version>,
    @InjectRepository(IssueVersion)
    private issueVersionRepository: Repository<IssueVersion>,
  ) {}

  async create(
    projectId: string,
    dto: CreateVersionDto,
  ): Promise<Version> {
    const existing = await this.versionRepository.findOne({
      where: { projectId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `A version named "${dto.name}" already exists in this project`,
      );
    }

    const version = this.versionRepository.create({
      projectId,
      ...dto,
    });
    return this.versionRepository.save(version);
  }

  async findAll(projectId: string): Promise<Version[]> {
    return this.versionRepository.find({
      where: { projectId },
      order: { releaseDate: 'ASC', createdAt: 'ASC' },
    });
  }

  async findById(id: string): Promise<Version> {
    const version = await this.versionRepository.findOne({
      where: { id },
    });
    if (!version) {
      throw new NotFoundException('Version not found');
    }
    return version;
  }

  async update(id: string, dto: UpdateVersionDto): Promise<Version> {
    const version = await this.findById(id);
    Object.assign(version, dto);
    return this.versionRepository.save(version);
  }

  async delete(id: string): Promise<void> {
    const version = await this.findById(id);
    await this.versionRepository.remove(version);
  }

  async release(id: string): Promise<Version> {
    const version = await this.findById(id);
    if (version.status === 'released') {
      throw new BadRequestException('Version is already released');
    }
    version.status = 'released';
    version.releasedAt = new Date();
    return this.versionRepository.save(version);
  }

  async assignToIssue(
    issueId: string,
    versionId: string,
    relationType: string = 'fix',
  ): Promise<void> {
    await this.findById(versionId);
    const existing = await this.issueVersionRepository.findOne({
      where: { issueId, versionId, relationType },
    });
    if (existing) return;

    const issueVersion = this.issueVersionRepository.create({
      issueId,
      versionId,
      relationType,
    });
    await this.issueVersionRepository.save(issueVersion);
  }

  async removeFromIssue(
    issueId: string,
    versionId: string,
    relationType: string = 'fix',
  ): Promise<void> {
    await this.issueVersionRepository.delete({
      issueId,
      versionId,
      relationType,
    });
  }

  async getIssueVersions(
    issueId: string,
    relationType?: string,
  ): Promise<IssueVersion[]> {
    const where: any = { issueId };
    if (relationType) where.relationType = relationType;

    return this.issueVersionRepository.find({
      where,
      relations: ['version'],
    });
  }

  async setIssueVersions(
    issueId: string,
    versionIds: string[],
    relationType: string = 'fix',
  ): Promise<IssueVersion[]> {
    // Remove all existing of this relation type
    await this.issueVersionRepository.delete({ issueId, relationType });

    // Add new ones
    for (const versionId of versionIds) {
      const iv = this.issueVersionRepository.create({
        issueId,
        versionId,
        relationType,
      });
      await this.issueVersionRepository.save(iv);
    }

    return this.getIssueVersions(issueId, relationType);
  }

  async getVersionIssueCount(versionId: string): Promise<{
    total: number;
    done: number;
    inProgress: number;
    todo: number;
  }> {
    const issueVersions = await this.issueVersionRepository.find({
      where: { versionId, relationType: 'fix' },
      relations: ['issue', 'issue.status'],
    });

    let done = 0;
    let inProgress = 0;
    let todo = 0;

    for (const iv of issueVersions) {
      const category = iv.issue?.status?.category;
      if (category === 'done') done++;
      else if (category === 'in_progress') inProgress++;
      else todo++;
    }

    return {
      total: issueVersions.length,
      done,
      inProgress,
      todo,
    };
  }
}
