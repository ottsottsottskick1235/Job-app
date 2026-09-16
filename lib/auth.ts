import type { User } from '@supabase/supabase-js';
import { ApiError } from './api';
import { getSupabaseAdmin } from './supabaseAdmin';

export type AccountType = 'worker' | 'employer';

export type AuthContext = {
  user: User;
  token: string;
  profile: {
    id: string;
    account_type: AccountType;
    full_name: string | null;
  };
};

export function getBearerToken(request: Request) {
  const header = request.headers.get('authorization');
  if (!header) throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in is required.');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new ApiError(401, 'INVALID_AUTH_HEADER', 'Authorization header must use Bearer authentication.');
  return match[1].trim();
}

export async function requireAuth(request: Request): Promise<AuthContext> {
  const token = getBearerToken(request);
  const db = getSupabaseAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'INVALID_SESSION', 'Session is invalid or expired.');

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, account_type, full_name')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new ApiError(409, 'PROFILE_REQUIRED', 'Account profile is missing. Complete account setup first.');

  return { user: data.user, token, profile: profile as AuthContext['profile'] };
}

export async function requireAccountType(request: Request, accountType: AccountType) {
  const auth = await requireAuth(request);
  if (auth.profile.account_type !== accountType) {
    throw new ApiError(403, 'ACCOUNT_TYPE_FORBIDDEN', `This action requires an ${accountType} account.`);
  }
  return auth;
}
