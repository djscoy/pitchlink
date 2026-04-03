import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    '[PitchLink] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Database operations will fail.',
  );
}

/**
 * Lazy-initialized Supabase admin client.
 * Server starts even without env vars — DB calls will fail with a clear error.
 */
let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
    _adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }
  return _adminClient;
}

/**
 * Proxy object that lazily initializes the admin client on first use.
 * Keeps existing code working with `supabaseAdmin.from(...)` syntax.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

/**
 * Create a Supabase client scoped to a user's JWT.
 * This client respects RLS policies.
 */
export function createUserClient(accessToken: string) {
  if (!supabaseUrl) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL.');
  }
  return createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY || '', {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
