/**
 * PitchLink IndexedDB Cache Layer
 *
 * Provides offline-first reads for contacts, campaigns, and pipeline state.
 * The sidebar renders from cache first, then syncs in background.
 *
 * Uses the `idb` library for a clean Promise-based API over IndexedDB.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Contact, Campaign, Deal, PipelinePreset, Template } from '@pitchlink/shared';

// ============================================================
// Database Schema
// ============================================================

interface PitchLinkDB extends DBSchema {
  contacts: {
    key: string; // contact id
    value: Contact & { _cachedAt: number };
    indexes: {
      'by-email': string;
      'by-workspace': string;
    };
  };
  campaigns: {
    key: string;
    value: Campaign & { _cachedAt: number };
    indexes: {
      'by-workspace': string;
    };
  };
  deals: {
    key: string;
    value: Deal & { _cachedAt: number };
    indexes: {
      'by-campaign': string;
      'by-contact': string;
    };
  };
  pipeline_presets: {
    key: string;
    value: PipelinePreset & { _cachedAt: number };
  };
  templates: {
    key: string;
    value: Template & { _cachedAt: number };
    indexes: {
      'by-workspace': string;
    };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown; updatedAt: number };
  };
}

const DB_NAME = 'pitchlink-cache';
const DB_VERSION = 1;

// ============================================================
// Database Initialization
// ============================================================

let dbPromise: Promise<IDBPDatabase<PitchLinkDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PitchLinkDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PitchLinkDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Contacts
        const contactStore = db.createObjectStore('contacts', { keyPath: 'id' });
        contactStore.createIndex('by-email', 'email');
        contactStore.createIndex('by-workspace', 'workspace_id');

        // Campaigns
        const campaignStore = db.createObjectStore('campaigns', { keyPath: 'id' });
        campaignStore.createIndex('by-workspace', 'workspace_id');

        // Deals
        const dealStore = db.createObjectStore('deals', { keyPath: 'id' });
        dealStore.createIndex('by-campaign', 'campaign_id');
        dealStore.createIndex('by-contact', 'contact_id');

        // Pipeline Presets
        db.createObjectStore('pipeline_presets', { keyPath: 'id' });

        // Templates
        const templateStore = db.createObjectStore('templates', { keyPath: 'id' });
        templateStore.createIndex('by-workspace', 'workspace_id');

        // Meta (sync state, preferences, etc.)
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

// ============================================================
// Cache Operations
// ============================================================

export const cache = {
  // --- Contacts ---

  async getContact(id: string): Promise<Contact | undefined> {
    const db = await getDB();
    const result = await db.get('contacts', id);
    if (result) {
      const { _cachedAt, ...contact } = result;
      return contact;
    }
    return undefined;
  },

  async getContactByEmail(email: string): Promise<Contact | undefined> {
    const db = await getDB();
    const result = await db.getFromIndex('contacts', 'by-email', email);
    if (result) {
      const { _cachedAt, ...contact } = result;
      return contact;
    }
    return undefined;
  },

  async putContact(contact: Contact): Promise<void> {
    const db = await getDB();
    await db.put('contacts', { ...contact, _cachedAt: Date.now() });
  },

  async putContacts(contacts: Contact[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('contacts', 'readwrite');
    await Promise.all([
      ...contacts.map((c) => tx.store.put({ ...c, _cachedAt: Date.now() })),
      tx.done,
    ]);
  },

  // --- Campaigns ---

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const db = await getDB();
    const result = await db.get('campaigns', id);
    if (result) {
      const { _cachedAt, ...campaign } = result;
      return campaign;
    }
    return undefined;
  },

  async getCampaignsByWorkspace(workspaceId: string): Promise<Campaign[]> {
    const db = await getDB();
    const results = await db.getAllFromIndex('campaigns', 'by-workspace', workspaceId);
    return results.map(({ _cachedAt, ...campaign }) => campaign);
  },

  async putCampaigns(campaigns: Campaign[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('campaigns', 'readwrite');
    await Promise.all([
      ...campaigns.map((c) => tx.store.put({ ...c, _cachedAt: Date.now() })),
      tx.done,
    ]);
  },

  // --- Deals ---

  async getDealsByCampaign(campaignId: string): Promise<Deal[]> {
    const db = await getDB();
    const results = await db.getAllFromIndex('deals', 'by-campaign', campaignId);
    return results.map(({ _cachedAt, ...deal }) => deal);
  },

  async putDeals(deals: Deal[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('deals', 'readwrite');
    await Promise.all([
      ...deals.map((d) => tx.store.put({ ...d, _cachedAt: Date.now() })),
      tx.done,
    ]);
  },

  // --- Pipeline Presets ---

  async getPresets(): Promise<PipelinePreset[]> {
    const db = await getDB();
    const results = await db.getAll('pipeline_presets');
    return results.map(({ _cachedAt, ...preset }) => preset);
  },

  async putPresets(presets: PipelinePreset[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('pipeline_presets', 'readwrite');
    await Promise.all([
      ...presets.map((p) => tx.store.put({ ...p, _cachedAt: Date.now() })),
      tx.done,
    ]);
  },

  // --- Templates ---

  async getTemplatesByWorkspace(workspaceId: string): Promise<Template[]> {
    const db = await getDB();
    const results = await db.getAllFromIndex('templates', 'by-workspace', workspaceId);
    return results.map(({ _cachedAt, ...template }) => template);
  },

  async putTemplates(templates: Template[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('templates', 'readwrite');
    await Promise.all([
      ...templates.map((t) => tx.store.put({ ...t, _cachedAt: Date.now() })),
      tx.done,
    ]);
  },

  // --- Meta ---

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await getDB();
    const result = await db.get('meta', key);
    return result?.value as T | undefined;
  },

  async setMeta(key: string, value: unknown): Promise<void> {
    const db = await getDB();
    await db.put('meta', { key, value, updatedAt: Date.now() });
  },

  // --- Utilities ---

  async clearAll(): Promise<void> {
    const db = await getDB();
    await db.clear('contacts');
    await db.clear('campaigns');
    await db.clear('deals');
    await db.clear('pipeline_presets');
    await db.clear('templates');
    await db.clear('meta');
  },
};
