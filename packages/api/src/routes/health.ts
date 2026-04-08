import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'pitchlink-api',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.10.0',
  });
});
