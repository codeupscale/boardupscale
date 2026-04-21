export default () => ({
  app: {
    port: parseInt(process.env.PORT, 10) || 4000,
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    // AES-256-GCM key for encrypting Jira API tokens in jira_connections.
    // Falls back to process.env.APP_SECRET for backwards compatibility.
    secret: process.env.APP_SECRET || 'dev-only-app-secret-change-before-deploy',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/boardupscale',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    name: process.env.DB_NAME || 'boardupscale',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  jwt: {
    // No insecure hardcoded fallback — startup will throw if JWT_SECRET is missing in production.
    secret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET must be set in production'); })() : 'dev-only-secret-change-before-deploy'),
    expiry: process.env.JWT_EXPIRY || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET must be set in production'); })() : 'dev-only-refresh-secret-change-before-deploy'),
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT, 10) || 9000,
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'boardupscale',
    useSSL: process.env.MINIO_USE_SSL === 'true',
    // Optional: the endpoint the BROWSER uses to PUT/GET objects via presigned
    // URLs. Internal compose networking uses `minio:9000` which isn't reachable
    // from a user's browser — set this to the public host (e.g.
    // `https://s3.boardupscale.com`) in prod. Falls back to the internal URL.
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || '',
    // MinIO requires path-style (http://minio/bucket/key). Real AWS S3 prefers
    // virtual-hosted-style (http://bucket.s3.amazonaws.com/key). Default=true
    // keeps MinIO working; set to "false" when pointing at AWS S3.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl:
        process.env.GOOGLE_CALLBACK_URL ||
        `http://localhost:4000/api/auth/google/callback`,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      callbackUrl:
        process.env.GITHUB_CALLBACK_URL ||
        `http://localhost:4000/api/auth/github/callback`,
    },
  },
  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT, 10) || 1025,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@boardupscale.com',
  },
  ai: {
    enabled: process.env.AI_ENABLED === 'true',
    provider: process.env.AI_PROVIDER || 'openai',
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || '',
    embeddingModel: process.env.AI_EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL || '',
    maxTokensPerOrgPerDay: parseInt(process.env.AI_MAX_TOKENS_PER_ORG_PER_DAY, 10) || 100000,
  },
  saml: {
    entryPoint: process.env.SAML_ENTRY_POINT || '',
    issuer: process.env.SAML_ISSUER || 'boardupscale',
    cert: process.env.SAML_CERT || '',
    callbackUrl: process.env.SAML_CALLBACK_URL || 'http://localhost:4000/api/auth/saml/callback',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  },
  github: {
    webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET || '',
  },
  atlassian: {
    clientId: process.env.ATLASSIAN_CLIENT_ID || '',
    clientSecret: process.env.ATLASSIAN_CLIENT_SECRET || '',
    // Must match the redirect URI registered in the Atlassian Developer Console
    callbackUrl:
      process.env.ATLASSIAN_CALLBACK_URL ||
      'http://localhost:4000/api/migration/jira/oauth/callback',
    frontendRedirectUrl:
      process.env.ATLASSIAN_FRONTEND_REDIRECT_URL ||
      'http://localhost:3000/settings/migrate/jira',
  },
  // Enterprise Edition features — requires ENTERPRISE_ENABLED=true.
  // Self-hosters with a commercial licence set this to true.
  enterprise: {
    enabled: process.env.ENTERPRISE_ENABLED === 'true',
  },
  // Anonymous usage telemetry — helps us understand adoption without
  // collecting any personally identifiable information.
  // Set TELEMETRY_ENABLED=false to opt out completely.
  telemetry: {
    enabled: process.env.TELEMETRY_ENABLED !== 'false',
    endpoint: process.env.TELEMETRY_ENDPOINT || 'https://telemetry.boardupscale.com/ping',
  },
});
