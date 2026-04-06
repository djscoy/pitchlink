import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { contactsService, ConflictError } from '../services/contacts';
import { enrichmentService } from '../services/enrichment';

export const contactsRouter = Router();

// All routes require auth
contactsRouter.use(requireAuth);

/**
 * GET /api/contacts
 * List contacts for the workspace
 * Query params: search, limit, offset
 */
contactsRouter.get('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { search, limit, offset } = req.query;

    const result = await contactsService.list(workspaceId, {
      search: search as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({ data: result });
  } catch (err) {
    console.error('[Contacts] List error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list contacts' } });
  }
});

/**
 * GET /api/contacts/lookup?email=foo@bar.com
 * Look up a contact by email (used by sidebar when opening a thread)
 */
contactsRouter.get('/lookup', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const email = req.query.email as string;

    if (!email) {
      return res.status(400).json({
        error: { code: 'MISSING_EMAIL', message: 'Email query parameter is required' },
      });
    }

    const contact = await contactsService.getByEmail(workspaceId, email);

    if (!contact) {
      return res.json({ data: null }); // Not found is not an error — sidebar shows "Add" card
    }

    res.json({ data: contact });
  } catch (err) {
    console.error('[Contacts] Lookup error:', err);
    res.status(500).json({ error: { code: 'LOOKUP_FAILED', message: 'Failed to look up contact' } });
  }
});

/**
 * GET /api/contacts/unassigned?campaign_id=X
 * List contacts NOT assigned to a specific campaign
 */
contactsRouter.get('/unassigned', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { campaign_id, search, limit, offset } = req.query;

    if (!campaign_id) {
      return res.status(400).json({
        error: { code: 'MISSING_CAMPAIGN', message: 'campaign_id query parameter is required' },
      });
    }

    const result = await contactsService.listUnassigned(workspaceId, campaign_id as string, {
      search: search as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({ data: result });
  } catch (err) {
    console.error('[Contacts] List unassigned error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list unassigned contacts' } });
  }
});

/**
 * GET /api/contacts/enrichment/providers
 * List available enrichment providers
 */
contactsRouter.get('/enrichment/providers', async (_req, res: Response) => {
  try {
    const available = enrichmentService.getAvailableProviders();
    res.json({ data: { providers: available } });
  } catch (err) {
    console.error('[Contacts] Providers error:', err);
    res.status(500).json({ error: { code: 'PROVIDERS_FAILED', message: 'Failed to list providers' } });
  }
});

/**
 * POST /api/contacts/bulk-enrich
 * Bulk enrich all contacts in a campaign
 */
contactsRouter.post('/bulk-enrich', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { campaign_id } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        error: { code: 'MISSING_CAMPAIGN', message: 'campaign_id is required' },
      });
    }

    const result = await enrichmentService.bulkEnrich(workspaceId, campaign_id);
    res.json({ data: result });
  } catch (err) {
    console.error('[Contacts] Bulk enrich error:', err);
    res.status(500).json({ error: { code: 'BULK_ENRICH_FAILED', message: 'Bulk enrichment failed' } });
  }
});

/**
 * POST /api/contacts/:id/enrich
 * Enrich a contact using available providers
 */
contactsRouter.post('/:id/enrich', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const result = await enrichmentService.enrich(workspaceId, req.params.id);
    res.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed';
    console.error('[Contacts] Enrich error:', err);
    res.status(message.includes('not found') ? 404 : message.includes('No enrichment') ? 400 : 500).json({
      error: { code: 'ENRICH_FAILED', message },
    });
  }
});

/**
 * GET /api/contacts/campaign/:campaignId/export
 * Export contacts for a campaign as CSV
 * NOTE: Must be before /:id routes to avoid Express matching "campaign" as :id
 */
contactsRouter.get('/campaign/:campaignId/export', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const csv = await contactsService.exportCampaignCSV(workspaceId, req.params.campaignId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="contacts-${req.params.campaignId}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[Contacts] Export error:', err);
    res.status(500).json({ error: { code: 'EXPORT_FAILED', message: 'Failed to export contacts' } });
  }
});

/**
 * GET /api/contacts/:id/enrichment
 * Get cached enrichment data for a contact
 */
contactsRouter.get('/:id/enrichment', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    // Verify the contact belongs to this workspace before returning enrichment data
    await contactsService.getById(workspaceId, req.params.id);
    const summary = await enrichmentService.getSummary(req.params.id);
    const cached = await enrichmentService.getCached(req.params.id);
    res.json({ data: { summary, providers: cached.map((c) => ({ provider: c.provider, fetched_at: c.fetched_at, expires_at: c.expires_at })) } });
  } catch (err) {
    console.error('[Contacts] Get enrichment error:', err);
    res.status(500).json({ error: { code: 'GET_ENRICHMENT_FAILED', message: 'Failed to get enrichment data' } });
  }
});

/**
 * GET /api/contacts/:id
 */
contactsRouter.get('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const contact = await contactsService.getById(workspaceId, req.params.id);
    res.json({ data: contact });
  } catch (err) {
    console.error('[Contacts] Get error:', err);
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Contact not found' } });
  }
});

/**
 * POST /api/contacts
 * Create a new contact
 */
contactsRouter.post('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { email, name, domain, tags, notes, custom_fields } = req.body;

    if (!email) {
      return res.status(400).json({
        error: { code: 'MISSING_EMAIL', message: 'Email is required' },
      });
    }

    const contact = await contactsService.create(workspaceId, {
      email,
      name,
      domain,
      tags,
      notes,
      custom_fields,
    });

    // Auto-enrich on create (fire-and-forget — don't block the response)
    if (enrichmentService.getAvailableProviders().length > 0) {
      enrichmentService.enrich(workspaceId, contact.id).catch((err) => {
        console.warn('[Contacts] Auto-enrich on create failed:', err);
      });
    }

    res.status(201).json({ data: contact });
  } catch (err) {
    if (err instanceof ConflictError) {
      return res.status(409).json({ error: { code: err.code, message: err.message } });
    }
    console.error('[Contacts] Create error:', err);
    res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Failed to create contact' } });
  }
});

/**
 * PATCH /api/contacts/:id
 * Update a contact
 */
contactsRouter.patch('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { name, domain, tags, notes, custom_fields } = req.body;

    const contact = await contactsService.update(workspaceId, req.params.id, {
      name,
      domain,
      tags,
      notes,
      custom_fields,
    });

    res.json({ data: contact });
  } catch (err) {
    console.error('[Contacts] Update error:', err);
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Failed to update contact' } });
  }
});

/**
 * DELETE /api/contacts/:id
 */
contactsRouter.delete('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    await contactsService.delete(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[Contacts] Delete error:', err);
    res.status(500).json({ error: { code: 'DELETE_FAILED', message: 'Failed to delete contact' } });
  }
});


