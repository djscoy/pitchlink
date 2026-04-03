import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../db/supabase';

/**
 * Auth context attached to requests after requireAuth middleware.
 */
export interface AuthContext {
  userId: string;
  workspaceId: string;
  userEmail: string;
}

// Store auth context on request via a symbol to avoid TS conflicts with parameterized Request types
const AUTH_KEY = Symbol('pitchlink-auth');

/**
 * Get auth context from an authenticated request.
 */
export function getAuth(req: Request): AuthContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth = (req as any)[AUTH_KEY] as AuthContext | undefined;
  if (!auth) throw new Error('Auth context not found — is requireAuth middleware applied?');
  return auth;
}

/**
 * Verify a Google OAuth access token and return the user info.
 */
async function verifyGoogleToken(token: string): Promise<{ email: string; name: string; google_id: string; avatar_url?: string } | null> {
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.email) return null;

    return {
      email: data.email.toLowerCase(),
      name: data.name || '',
      google_id: data.sub,
      avatar_url: data.picture,
    };
  } catch {
    return null;
  }
}

/**
 * Auto-provision a user and workspace if they don't exist yet.
 * Called when a Google token is verified but no matching user record exists.
 */
async function autoProvisionUser(googleInfo: { email: string; name: string; google_id: string; avatar_url?: string }, accessToken: string) {
  // Check if user exists by google_id or email
  let { data: dbUser } = await supabaseAdmin
    .from('users')
    .select('id, workspace_id, email')
    .eq('google_id', googleInfo.google_id)
    .maybeSingle();

  if (!dbUser) {
    // Try by email
    const { data: byEmail } = await supabaseAdmin
      .from('users')
      .select('id, workspace_id, email')
      .eq('email', googleInfo.email)
      .maybeSingle();
    dbUser = byEmail;
  }

  if (dbUser) return dbUser;

  // Create new user
  const { data: newUser, error: userError } = await supabaseAdmin
    .from('users')
    .insert({
      email: googleInfo.email,
      google_id: googleInfo.google_id,
      name: googleInfo.name,
      avatar_url: googleInfo.avatar_url,
      plan_tier: 'free',
    })
    .select()
    .single();

  if (userError) throw userError;

  // Create workspace
  const { data: workspace, error: wsError } = await supabaseAdmin
    .from('workspaces')
    .insert({
      name: `${googleInfo.name || googleInfo.email}'s Workspace`,
      owner_id: newUser.id,
      plan: 'free',
    })
    .select()
    .single();

  if (wsError) throw wsError;

  // Link user to workspace
  await supabaseAdmin
    .from('users')
    .update({ workspace_id: workspace.id })
    .eq('id', newUser.id);

  // Create primary email account
  await supabaseAdmin
    .from('email_accounts')
    .insert({
      workspace_id: workspace.id,
      user_id: newUser.id,
      email: googleInfo.email,
      display_name: googleInfo.name,
      is_primary: true,
      is_send_as: false,
    });

  // Store Gmail access token for IIE and reply detection
  await supabaseAdmin
    .from('gmail_watch_state')
    .upsert({
      user_id: newUser.id,
      access_token_encrypted: accessToken,
      history_id: null,
      watch_expiry: null,
    }, { onConflict: 'user_id' });

  console.log(`[Auth] Auto-provisioned user ${googleInfo.email} with workspace ${workspace.id}`);

  return { id: newUser.id, workspace_id: workspace.id, email: googleInfo.email };
}

/**
 * Auth middleware: validates the Bearer token and attaches user + workspace info to req.
 * Supports both Supabase JWTs and Google OAuth access tokens.
 * Auto-provisions users on first Google OAuth login.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
      });
    }

    const token = authHeader.slice(7);

    // Try 1: Verify as Supabase JWT
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (!error && user) {
      // Supabase JWT path
      const { data: dbUser, error: dbError } = await supabaseAdmin
        .from('users')
        .select('id, workspace_id, email')
        .eq('id', user.id)
        .single();

      if (!dbError && dbUser?.workspace_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any)[AUTH_KEY] = {
          userId: dbUser.id,
          workspaceId: dbUser.workspace_id,
          userEmail: dbUser.email,
        } satisfies AuthContext;
        return next();
      }
    }

    // Try 2: Verify as Google OAuth access token
    const googleInfo = await verifyGoogleToken(token);
    if (!googleInfo) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
    }

    // Auto-provision user if needed, update Gmail token
    const dbUser = await autoProvisionUser(googleInfo, token);

    if (!dbUser.workspace_id) {
      return res.status(403).json({
        error: { code: 'NO_WORKSPACE', message: 'User has no workspace assigned' },
      });
    }

    // Update stored Gmail access token on every request (tokens rotate)
    await supabaseAdmin
      .from('gmail_watch_state')
      .upsert({
        user_id: dbUser.id,
        access_token_encrypted: token,
      }, { onConflict: 'user_id' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[AUTH_KEY] = {
      userId: dbUser.id,
      workspaceId: dbUser.workspace_id,
      userEmail: dbUser.email,
    } satisfies AuthContext;

    next();
  } catch (err) {
    console.error('[Auth] Error:', err);
    return res.status(500).json({
      error: { code: 'AUTH_ERROR', message: 'Authentication failed' },
    });
  }
}
