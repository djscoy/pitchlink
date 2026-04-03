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
 * Auth middleware: validates the Bearer token and attaches user + workspace info to req.
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

    // Verify the token with Supabase
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
    }

    // Get user record with workspace_id
    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, workspace_id, email')
      .eq('id', user.id)
      .single();

    if (dbError || !dbUser) {
      return res.status(401).json({
        error: { code: 'USER_NOT_FOUND', message: 'User record not found' },
      });
    }

    if (!dbUser.workspace_id) {
      return res.status(403).json({
        error: { code: 'NO_WORKSPACE', message: 'User has no workspace assigned' },
      });
    }

    // Attach to request via symbol
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
