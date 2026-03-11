import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectQueue('email')
    private emailQueue: Queue,
  ) {}

  async sendWelcomeEmail(
    to: string,
    displayName: string,
    organizationName: string,
  ): Promise<void> {
    await this.emailQueue.add('welcome', {
      to,
      displayName,
      organizationName,
    });
    this.logger.log(`Enqueued welcome email to ${to}`);
  }

  async sendIssueAssignedEmail(
    to: string,
    displayName: string,
    issueKey: string,
    issueTitle: string,
    projectName: string,
    issueUrl: string,
  ): Promise<void> {
    await this.emailQueue.add('issue-assigned', {
      to,
      displayName,
      issueKey,
      issueTitle,
      projectName,
      issueUrl,
    });
    this.logger.log(`Enqueued issue-assigned email to ${to} for ${issueKey}`);
  }

  async sendCommentMentionEmail(
    to: string,
    displayName: string,
    commenterName: string,
    issueKey: string,
    issueTitle: string,
    commentContent: string,
    issueUrl: string,
  ): Promise<void> {
    await this.emailQueue.add('comment-mentioned', {
      to,
      displayName,
      commenterName,
      issueKey,
      issueTitle,
      commentContent,
      issueUrl,
    });
    this.logger.log(`Enqueued comment-mentioned email to ${to} for ${issueKey}`);
  }

  async sendSprintReminderEmail(
    to: string,
    displayName: string,
    sprintName: string,
    endDate: string,
    projectName: string,
  ): Promise<void> {
    await this.emailQueue.add('sprint-reminder', {
      to,
      displayName,
      sprintName,
      endDate,
      projectName,
    });
    this.logger.log(`Enqueued sprint-reminder email to ${to} for sprint "${sprintName}"`);
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.emailQueue.add('password-reset', {
      to,
      resetUrl,
    });
    this.logger.log(`Enqueued password-reset email to ${to}`);
  }

  async sendInvitationEmail(
    to: string,
    inviterName: string,
    organizationName: string,
    inviteUrl: string,
  ): Promise<void> {
    await this.emailQueue.add('member-invitation', {
      to,
      inviterName,
      organizationName,
      inviteUrl,
    });
    this.logger.log(`Enqueued member-invitation email to ${to}`);
  }
}
