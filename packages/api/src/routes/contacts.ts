import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { contactsService, ConflictError } from '../services/contacts';

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

/**
 * GET /api/contacts/campaign/:campaignId/export
 * Export contacts for a campaign as CSV
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
