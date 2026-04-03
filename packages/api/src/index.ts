import 'dotenv/config';
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
    origin: [
      'chrome-extension://*', // Dev: any extension
      process.env.EXTENSION_ID ? `chrome-extension://${process.env.EXTENSION_ID}` : '',
      'http://localhost:3000', // Dev fallback
    ].filter(Boolean),
    credentials: true,
  }),
);

// Rate limiting
const { generalLimiter, webhookLimiter } = createRateLimiters();
app.use('/api', generalLimiter);
app.use('/api/gmail/webhook', webhookLimiter);

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
});

export default app;
