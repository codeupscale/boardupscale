import { Worker, Job } from 'bullmq';
import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';
import { createRedisConnection } from '../redis';

// ─── Job payload types ───────────────────────────────────────────────────────

interface WelcomeJobData {
  to: string;
  displayName: string;
  organizationName: string;
}

interface IssueAssignedJobData {
  to: string;
  displayName: string;
  issueKey: string;
  issueTitle: string;
  projectName: string;
  issueUrl: string;
}

interface CommentMentionedJobData {
  to: string;
  displayName: string;
  commenterName: string;
  issueKey: string;
  issueTitle: string;
  commentContent: string;
  issueUrl: string;
}

interface SprintReminderJobData {
  to: string;
  displayName: string;
  sprintName: string;
  endDate: string;
  projectName: string;
}

interface PasswordResetJobData {
  to: string;
  resetUrl: string;
}

interface EmailVerificationJobData {
  to: string;
  verificationUrl: string;
}

interface MemberInvitationJobData {
  to: string;
  inviterName: string;
  organizationName: string;
  inviteUrl: string;
}

// ─── HTML template helpers ───────────────────────────────────────────────────

function emailWrapper(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .wrapper { width: 100%; background: #f4f5f7; padding: 40px 0; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #0052cc; padding: 28px 32px; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header span { color: #4c9aff; }
    .body { padding: 32px; color: #172b4d; font-size: 15px; line-height: 1.6; }
    .body h2 { margin: 0 0 16px; font-size: 18px; color: #172b4d; }
    .body p { margin: 0 0 16px; }
    .issue-card { background: #f4f5f7; border-left: 4px solid #0052cc; border-radius: 4px; padding: 14px 16px; margin: 20px 0; }
    .issue-card .key { font-size: 12px; font-weight: 700; color: #0052cc; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .issue-card .title { font-size: 15px; font-weight: 600; color: #172b4d; }
    .btn { display: inline-block; background: #0052cc; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: 600; font-size: 14px; margin: 8px 0; }
    .btn:hover { background: #0065ff; }
    .divider { border: none; border-top: 1px solid #ebecf0; margin: 24px 0; }
    .quote { background: #fffae6; border-left: 4px solid #ff991f; border-radius: 4px; padding: 12px 16px; margin: 16px 0; font-size: 14px; color: #172b4d; font-style: italic; }
    .footer { background: #f4f5f7; padding: 20px 32px; text-align: center; font-size: 12px; color: #6b778c; }
    .footer a { color: #0052cc; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Project<span>Flow</span></h1>
      </div>
      <div class="body">
        ${bodyHtml}
      </div>
      <div class="footer">
        <p>You received this email because you have an account on Boardupscale.</p>
        <p>&copy; ${new Date().getFullYear()} Boardupscale. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function welcomeTemplate(data: WelcomeJobData): { subject: string; html: string } {
  return {
    subject: `Welcome to ${data.organizationName} on Boardupscale`,
    html: emailWrapper(
      'Welcome to Boardupscale',
      `<h2>Welcome aboard, ${escapeHtml(data.displayName)}!</h2>
      <p>You've been added to <strong>${escapeHtml(data.organizationName)}</strong> on Boardupscale — your team's project management hub.</p>
      <p>Here's what you can do to get started:</p>
      <ul style="padding-left:20px; margin: 0 0 16px;">
        <li style="margin-bottom:8px;">Browse your team's projects and boards</li>
        <li style="margin-bottom:8px;">Create and assign issues</li>
        <li style="margin-bottom:8px;">Plan and track sprints</li>
        <li style="margin-bottom:8px;">Collaborate with your team in real-time</li>
      </ul>
      <p>
        <a href="${config.frontend.url}" class="btn">Go to Boardupscale</a>
      </p>
      <hr class="divider" />
      <p style="font-size:13px;color:#6b778c;">If you weren't expecting this invitation, you can safely ignore this email.</p>`
    ),
  };
}

function issueAssignedTemplate(data: IssueAssignedJobData): { subject: string; html: string } {
  return {
    subject: `[${data.issueKey}] You've been assigned: ${data.issueTitle}`,
    html: emailWrapper(
      'Issue Assigned',
      `<h2>Hi ${escapeHtml(data.displayName)},</h2>
      <p>You've been assigned to an issue in <strong>${escapeHtml(data.projectName)}</strong>.</p>
      <div class="issue-card">
        <div class="key">${escapeHtml(data.issueKey)}</div>
        <div class="title">${escapeHtml(data.issueTitle)}</div>
      </div>
      <p>
        <a href="${escapeHtml(data.issueUrl)}" class="btn">View Issue</a>
      </p>
      <hr class="divider" />
      <p style="font-size:13px;color:#6b778c;">You can update this issue's status, add comments, and log work directly from Boardupscale.</p>`
    ),
  };
}

function commentMentionedTemplate(data: CommentMentionedJobData): { subject: string; html: string } {
  const preview =
    data.commentContent.length > 200
      ? data.commentContent.substring(0, 200) + '…'
      : data.commentContent;

  return {
    subject: `${data.commenterName} mentioned you in [${data.issueKey}]`,
    html: emailWrapper(
      'You were mentioned',
      `<h2>Hi ${escapeHtml(data.displayName)},</h2>
      <p><strong>${escapeHtml(data.commenterName)}</strong> mentioned you in a comment on:</p>
      <div class="issue-card">
        <div class="key">${escapeHtml(data.issueKey)}</div>
        <div class="title">${escapeHtml(data.issueTitle)}</div>
      </div>
      <p>They wrote:</p>
      <div class="quote">${escapeHtml(preview)}</div>
      <p>
        <a href="${escapeHtml(data.issueUrl)}" class="btn">View Comment</a>
      </p>
      <hr class="divider" />
      <p style="font-size:13px;color:#6b778c;">Reply directly in Boardupscale to continue the conversation.</p>`
    ),
  };
}

function sprintReminderTemplate(data: SprintReminderJobData): { subject: string; html: string } {
  const formattedDate = new Date(data.endDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    subject: `Sprint "${data.sprintName}" ends on ${formattedDate}`,
    html: emailWrapper(
      'Sprint Ending Reminder',
      `<h2>Hi ${escapeHtml(data.displayName)},</h2>
      <p>This is a friendly reminder that the sprint <strong>${escapeHtml(data.sprintName)}</strong> in project <strong>${escapeHtml(data.projectName)}</strong> is ending soon.</p>
      <table style="background:#fff3cd;border-radius:6px;padding:16px 20px;margin:20px 0;width:100%;box-sizing:border-box;">
        <tr>
          <td style="font-size:13px;color:#856404;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Sprint ends</td>
        </tr>
        <tr>
          <td style="font-size:20px;font-weight:700;color:#172b4d;padding-top:4px;">${formattedDate}</td>
        </tr>
      </table>
      <p>Make sure all completed work is properly updated so your sprint report is accurate.</p>
      <p>
        <a href="${config.frontend.url}" class="btn">View Sprint Board</a>
      </p>
      <hr class="divider" />
      <p style="font-size:13px;color:#6b778c;">Any unfinished issues can be moved to the backlog or the next sprint during the sprint review.</p>`
    ),
  };
}

function passwordResetTemplate(data: PasswordResetJobData): { subject: string; html: string } {
  return {
    subject: 'Reset your Boardupscale password',
    html: emailWrapper(
      'Password Reset',
      `<h2>Reset your password</h2>
      <p>We received a request to reset the password for your Boardupscale account. Click the button below to choose a new password.</p>
      <p>
        <a href="${escapeHtml(data.resetUrl)}" class="btn">Reset Password</a>
      </p>
      <hr class="divider" />
      <p style="font-size:13px;color:#6b778c;">This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password will not be changed.</p>
      <p style="font-size:13px;color:#6b778c;">If the button above doesn't work, copy and paste this URL into your browser:</p>
      <p style="font-size:12px;color:#0052cc;word-break:break-all;">${escapeHtml(data.resetUrl)}</p>`
    ),
  };
}

function emailVerificationTemplate(data: EmailVerificationJobData): { subject: string; html: string } {
  return {
    subject: 'Verify your Boardupscale email address',
    html: emailWrapper(
      'Email Verification',
      `<h2>Verify your email address</h2>
      <p>Thanks for signing up for Boardupscale! Please verify your email address by clicking the button below.</p>
      <p>
        <a href="${escapeHtml(data.verificationUrl)}" class="btn">Verify Email</a>
      </p>
      <hr class="divider" />
      <p style="font-size:13px;color:#6b778c;">This link will expire in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.</p>
      <p style="font-size:13px;color:#6b778c;">If the button above doesn't work, copy and paste this URL into your browser:</p>
      <p style="font-size:12px;color:#0052cc;word-break:break-all;">${escapeHtml(data.verificationUrl)}</p>`
    ),
  };
}

function memberInvitationTemplate(data: MemberInvitationJobData): { subject: string; html: string } {
  return {
    subject: `You've been invited to ${data.organizationName} on Boardupscale`,
    html: emailWrapper(
      'Team Invitation',
      `<h2>You're invited!</h2>
      <p><strong>${escapeHtml(data.inviterName)}</strong> has invited you to join <strong>${escapeHtml(data.organizationName)}</strong> on Boardupscale.</p>
      <p>Click the button below to set up your account and start collaborating with your team.</p>
      <p>
        <a href="${escapeHtml(data.inviteUrl)}" class="btn">Accept Invitation</a>
      </p>
      <hr class="divider" />
      <p style="font-size:13px;color:#6b778c;">This invitation will expire in <strong>7 days</strong>. If you weren't expecting this invitation, you can safely ignore this email.</p>
      <p style="font-size:13px;color:#6b778c;">If the button above doesn't work, copy and paste this URL into your browser:</p>
      <p style="font-size:12px;color:#0052cc;word-break:break-all;">${escapeHtml(data.inviteUrl)}</p>`
    ),
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Transport factory ───────────────────────────────────────────────────────

function createTransport(): Transporter {
  const auth =
    config.smtp.user && config.smtp.pass
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined;

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });
}

// ─── Worker ─────────────────────────────────────────────────────────────────

export function createEmailWorker(): Worker {
  const transporter = createTransport();

  // Verify SMTP connection on startup (non-fatal)
  transporter.verify().then(() => {
    console.log('[EmailWorker] SMTP transporter is ready');
  }).catch((err: Error) => {
    console.warn('[EmailWorker] SMTP transporter verify failed:', err.message);
  });

  const worker = new Worker(
    'email',
    async (job: Job) => {
      console.log(`[EmailWorker] Processing job ${job.id} type="${job.name}"`);

      let message: { subject: string; html: string };

      switch (job.name) {
        case 'welcome': {
          const data = job.data as WelcomeJobData;
          message = welcomeTemplate(data);
          await transporter.sendMail({
            from: config.smtp.from,
            to: data.to,
            subject: message.subject,
            html: message.html,
          });
          break;
        }

        case 'issue-assigned': {
          const data = job.data as IssueAssignedJobData;
          message = issueAssignedTemplate(data);
          await transporter.sendMail({
            from: config.smtp.from,
            to: data.to,
            subject: message.subject,
            html: message.html,
          });
          break;
        }

        case 'comment-mentioned': {
          const data = job.data as CommentMentionedJobData;
          message = commentMentionedTemplate(data);
          await transporter.sendMail({
            from: config.smtp.from,
            to: data.to,
            subject: message.subject,
            html: message.html,
          });
          break;
        }

        case 'sprint-reminder': {
          const data = job.data as SprintReminderJobData;
          message = sprintReminderTemplate(data);
          await transporter.sendMail({
            from: config.smtp.from,
            to: data.to,
            subject: message.subject,
            html: message.html,
          });
          break;
        }

        case 'password-reset': {
          const data = job.data as PasswordResetJobData;
          message = passwordResetTemplate(data);
          await transporter.sendMail({
            from: config.smtp.from,
            to: data.to,
            subject: message.subject,
            html: message.html,
          });
          break;
        }

        case 'email-verification': {
          const data = job.data as EmailVerificationJobData;
          message = emailVerificationTemplate(data);
          await transporter.sendMail({
            from: config.smtp.from,
            to: data.to,
            subject: message.subject,
            html: message.html,
          });
          break;
        }

        case 'member-invitation': {
          const data = job.data as MemberInvitationJobData;
          message = memberInvitationTemplate(data);
          await transporter.sendMail({
            from: config.smtp.from,
            to: data.to,
            subject: message.subject,
            html: message.html,
          });
          break;
        }

        default:
          throw new Error(`[EmailWorker] Unknown job type: "${job.name}"`);
      }

      console.log(`[EmailWorker] Job ${job.id} (${job.name}) completed successfully`);
    },
    {
      connection: createRedisConnection() as any,
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    }
  );

  worker.on('completed', (job: Job) => {
    console.log(`[EmailWorker] Job ${job.id} (${job.name}) finished`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[EmailWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  worker.on('error', (err: Error) => {
    console.error('[EmailWorker] Worker error:', err.message);
  });

  console.log('[EmailWorker] Started, listening on queue "email"');
  return worker;
}
