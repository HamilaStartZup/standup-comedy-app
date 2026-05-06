import path from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import authRoutes from './routes/auth';
import eventsRoutes from './routes/events';
import applicationsRoutes from './routes/applications';
import profileRoutes from './routes/profile';
import emailRoutes from './routes/email';
import absencesRoutes from './routes/absences';
import favoritesRoutes from './routes/favorites';
import eventFavoritesRoutes from './routes/eventFavorites';
import applicationFavoritesRoutes from './routes/applicationFavorites';
import presenceAlertsRoutes from './routes/presenceAlerts';
import lateCancellationAlertsRoutes from './routes/lateCancellationAlerts';
import comedianReportRoutes from './routes/comedianReport';
import notificationRoutes from './routes/notification';
import sseRoutes from './routes/sse';
import oauthRoutes from './routes/oauth';
import recommendationsRoutes from './routes/recommendations';
import comediansRoutes from './routes/comedians';
import usersRoutes from './routes/users';
import stripeRoutes from './routes/stripe';
import venuesRoutes from './routes/venues';
import { handleStripeWebhook } from './controllers/stripe';

export const createApp = () => {
  const app = express();

  const corsOptions = {
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      const allowedOrigins = [
        config.frontend.url,
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:5174',
        ...config.cors.additionalOrigins,
      ];
      if (!origin || config.nodeEnv === 'development' || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers'],
    exposedHeaders: ['Authorization'],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 200,
  };

  app.use(cors(corsOptions));
  app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.sendStatus(200);
  });

  app.use(cookieParser());
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
  app.use(express.json({ limit: '6mb' }));
  app.use(express.urlencoded({ extended: true, limit: '6mb' }));

  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.log(`📨 Requête entrante: ${req.method} ${req.path}`);
    next();
  });

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventsRoutes);
  app.use('/api/applications', applicationsRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/email', emailRoutes);
  app.use('/api/absences', absencesRoutes);
  app.use('/api/favorites', favoritesRoutes);
  app.use('/api/event-favorites', eventFavoritesRoutes);
  app.use('/api/application-favorites', applicationFavoritesRoutes);
  app.use('/api/presence-alerts', presenceAlertsRoutes);
  app.use('/api/late-cancellation-alerts', lateCancellationAlertsRoutes);
  app.use('/api/comedian-reports', comedianReportRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/sse', sseRoutes);
  app.use('/api/auth/oauth', oauthRoutes);
  app.use('/api/recommendations', recommendationsRoutes);
  app.use('/api/comedians', comediansRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/stripe', stripeRoutes);
  app.use('/api/venues', venuesRoutes);

  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Erreur du serveur:', err.message);
    res.status(500).json({ message: 'Something went wrong!', error: err.message });
  });

  return app;
};

export const app = createApp();
