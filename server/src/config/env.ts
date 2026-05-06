// Configuration des variables d'environnement
export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    additionalOrigins: process.env.ADDITIONAL_CORS_ORIGINS?.split(',').filter(Boolean) || [],
  },

  jwt: {
    secret: process.env.JWT_SECRET || '', // Doit être défini via variable d'environnement
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  database: {
    url: process.env.DATABASE_URL || '', // Doit être défini via variable d'environnement
  },

  email: {
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT || '465', 10),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET || '',
  },

  cron: {
    secret: process.env.CRON_SECRET || 'dev_cron_secret_key',
    enabled: process.env.ENABLE_CRONS !== 'false', // true by default
    comedianReminderSchedule: process.env.CRON_COMEDIAN_SCHEDULE || '0 * * * *', // Toutes les heures
    organizerReminderSchedule: process.env.CRON_ORGANIZER_SCHEDULE || '0 */6 * * *', // Toutes les 6 heures
    markCompletedSchedule: process.env.CRON_MARK_COMPLETED_SCHEDULE || '0 2 * * *', // Tous les jours à 2h du matin
    presenceAlertSchedule: process.env.CRON_PRESENCE_ALERT_SCHEDULE || '0 9 * * *', // Tous les jours à 9h du matin
    accountCleanupSchedule: process.env.CRON_ACCOUNT_CLEANUP_SCHEDULE || '0 3 * * *', // Tous les jours à 3h du matin
    dailySpectatorRecapSchedule: process.env.CRON_DAILY_SPECTATOR_RECAP_SCHEDULE || '0 8 * * *', // Tous les jours à 8h
    paymentTimeoutSchedule: process.env.CRON_PAYMENT_TIMEOUT_SCHEDULE || '0 * * * *', // Toutes les heures
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },

  api: {
    url: process.env.API_URL || 'http://localhost:3001',
  },

  keycloak: {
    url: process.env.KEYCLOAK_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'standup-comedy',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'standup-app',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
    enabled: process.env.KEYCLOAK_ENABLED === 'true',
    get issuer() {
      return `${this.url}/realms/${this.realm}`;
    },
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
  },
};

// Validation de la configuration
export const validateConfig = (): void => {
  const errors: string[] = [];
  
  // Variables obligatoires
  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }
  
  if (!config.jwt.secret) {
    errors.push('JWT_SECRET is required');
  }

  if (!config.email.unsubscribeSecret) {
    errors.push('UNSUBSCRIBE_SECRET is required');
  }

  if (config.email.unsubscribeSecret && config.email.unsubscribeSecret.length < 32) {
    errors.push('UNSUBSCRIBE_SECRET must be at least 32 characters long');
  }

  if (config.nodeEnv === 'production' && !config.stripe.secretKey) {
    errors.push('STRIPE_SECRET_KEY is required in production');
  }

  if (config.nodeEnv === 'production' && !config.stripe.webhookSecret) {
    errors.push('STRIPE_WEBHOOK_SECRET is required in production');
  }

  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Configuration validation failed');
  }

  console.log('✅ Configuration validée avec succès');
};

