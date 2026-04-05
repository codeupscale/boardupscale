export const config = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6380',
  },

  database: {
    url: process.env.DATABASE_URL || 'postgresql://copilot:copilot@localhost:5433/boardupscale',
  },

  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    from: process.env.SMTP_FROM || 'Boardupscale <noreply@boardupscale.local>',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },

  /**
   * AES-256-GCM key for decrypting Jira API tokens stored in jira_connections.
   * Must match APP_SECRET used by the API service.
   */
  appSecret: process.env.APP_SECRET || 'boardupscale-dev-secret-change-before-production',

  /**
   * Atlassian OAuth 2.0 credentials — needed by the worker to refresh access
   * tokens mid-migration when they expire (Atlassian tokens expire after 1 hour).
   */
  atlassian: {
    clientId: process.env.ATLASSIAN_CLIENT_ID || '',
    clientSecret: process.env.ATLASSIAN_CLIENT_SECRET || '',
  },
};
