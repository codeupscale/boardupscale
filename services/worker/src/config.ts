export const config = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/boardupscale',
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
};
