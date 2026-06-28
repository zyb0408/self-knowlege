import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';

import { config } from './config';
import adminRoutes from './routes/admin';
import knowledgebaseRoutes from './routes/knowledgebase';
import documentRoutes from './routes/document';
import chatRoutes from './routes/chat';

const app = express();

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false, maxAge: config.sessionMaxAge },
  }),
);

// Routes
app.use('/api/admin', adminRoutes);
app.use('/api/knowledge-bases', knowledgebaseRoutes);
app.use('/api/knowledge-bases', documentRoutes);
app.use('/api/chat', chatRoutes);

// Start server
const server = app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

export default app;
