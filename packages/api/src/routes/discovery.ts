import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { discoveryService } from '../services/discovery';

export const discoveryRouter = Router();

discoveryRouter.use(requireAuth);

/**
 * GET /api/discovery/providers
 * List available discovery providers
 */
discoveryRouter.get('/providers', async (_req, res: Response) => {
  try {
    const providers = discoveryService.getAvailableProviders();
    res.json({ data: { providers } });
  } catch (err) {
    console.error('[Discovery] Providers error:', err);
    res.status(500).json({ error: { code: 'PROVIDERS_FAILED', message: 'Failed to list providers' } });
  }
});

/**
 * GET /api/discovery/domain?domain=example.com&limit=10&offset=0
 * Search for contacts by domain
 */
discoveryRouter.get('/domain', async (req, res: Response) => {
  try {
    const domain = req.query.domain as string;
    if (!domain) {
      return res.status(400).json({
        error: { code: 'MISSING_DOMAIN', message: 'domain query parameter is required' },
      });
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const result = await discoveryService.searchByDomain(domain, { limit, offset });
    res.json({ data: result });
  } catch (err) {
    console.error('[Discovery] Domain search error:', err);
    res.status(500).json({ error: { code: 'DOMAIN_SEARCH_FAILED', message: 'Domain search failed' } });
  }
});

/**
 * POST /api/discovery/people
 * Search for people by role, company, keywords
 */
discoveryRouter.post('/people', async (req, res: Response) => {
  try {
    const { company_domain, titles, seniorities, keywords, limit, page } = req.body;

    if (!company_domain && !titles?.length && !keywords) {
      return res.status(400).json({
        error: { code: 'MISSING_PARAMS', message: 'Provide at least one of: company_domain, titles, keywords' },
      });
    }

    const result = await discoveryService.searchByRole({
      company_domain,
      titles,
      seniorities,
      keywords,
      limit: Math.min(limit || 10, 50),
      page: page || 1,
    });

    res.json({ data: result });
  } catch (err) {
    console.error('[Discovery] People search error:', err);
    res.status(500).json({ error: { code: 'PEOPLE_SEARCH_FAILED', message: 'People search failed' } });
  }
});
