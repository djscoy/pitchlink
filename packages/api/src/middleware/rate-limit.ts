import rateLimit from 'express-rate-limit';
import { RATE_LIMITS } from '@pitchlink/shared';

export function createRateLimiters() {
  const generalLimiter = rateLimit({
    windowMs: RATE_LIMITS.GENERAL_API.windowMs,
    max: RATE_LIMITS.GENERAL_API.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    },
  });

  const aiLimiter = rateLimit({
    windowMs: RATE_LIMITS.AI_ENDPOINTS.windowMs,
    max: RATE_LIMITS.AI_ENDPOINTS.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'AI_RATE_LIMIT_EXCEEDED',
        message: 'AI request limit reached. Please wait before trying again.',
      },
    },
  });

  const webhookLimiter = rateLimit({
    windowMs: RATE_LIMITS.WEBHOOK.windowMs,
    max: RATE_LIMITS.WEBHOOK.max,
    standardHeaders: true,
    legacyHeaders: false,
  });

  return { generalLimiter, aiLimiter, webhookLimiter };
}
