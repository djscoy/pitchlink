import dotenv from 'dotenv';
import path from 'path';

// Load .env from monorepo root (handles npm workspace cwd differences)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createRateLimiters } from './middleware/rate-limit';
import { healthRouter } from './routes/health';
import { gmailWebhookRouter } from './routes/gmail-webhook';
import { contactsRouter } from './routes/contacts';
import { campaignsRouter } from './routes/campaigns';
import { dealsRouter } from './routes/deals';
import { pipelinePresetsRouter } from './routes/pipeline-presets';
import { templatesRouter } from './routes/templates';
import { authRouter } from './routes/auth';
import { iieRouter } from './routes/iie';
import { onboardingRouter } from './routes/onboarding';
import { composeRouter } from './routes/compose';
import { sequencesRouter } from './routes/sequences';
import { repliesRouter } from './routes/replies';
import { discoveryRouter } from './routes/discovery';
import { sequenceExecutorService } from './services/sequence-executor';

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// Middleware
// ============================================================

app.use(helmet());
app.use(express.json());

// CORS — allow Chrome extension origin
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (service workers, curl, etc.)
      if (!origin) return callback(null, true);
      // Allow any chrome-extension origin in development
      if (origin.startsWith('chrome-extension://')) return callback(null, true);
      // Allow localhost dev
      if (origin.startsWith('http://localhost:')) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);

// Onboarding routes — exempt from general rate limit (one-time heavy operation)
app.use('/api/onboarding', onboardingRouter);

// Rate limiting
const { generalLimiter, aiLimiter, webhookLimiter } = createRateLimiters();
app.use('/api', generalLimiter);
app.use('/api/gmail/webhook', webhookLimiter);
app.use('/api/iie/analyze', aiLimiter);
app.use('/api/compose/generate', aiLimiter);

// ============================================================
// Routes
// ============================================================

app.use('/api', healthRouter);
app.use('/api/gmail', gmailWebhookRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/deals', dealsRouter);
app.use('/api/pipeline-presets', pipelinePresetsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/auth', authRouter);
app.use('/api/iie', iieRouter);
app.use('/api/compose', composeRouter);
app.use('/api/sequences', sequencesRouter);
app.use('/api/replies', repliesRouter);
app.use('/api/discovery', discoveryRouter);

// ============================================================
// Error handler
// ============================================================

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[PitchLink API] Unhandled error:', err.message);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      },
    });
  },
);

// ============================================================
// Start
// ============================================================

app.listen(PORT, () => {
  console.log(`\n  \u26A1 PitchLink API running on http://localhost:${PORT}`);
  console.log(`  \u2764  Health check: http://localhost:${PORT}/api/health\n`);

  // Start the sequence executor (fires scheduled nudge steps every 5 minutes)
  sequenceExecutorService.start();
});

export default app;
