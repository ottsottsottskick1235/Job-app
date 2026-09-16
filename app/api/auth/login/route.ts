import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson, ApiError } from '@/lib/api';
import { getSupabaseAdmin, getSupabasePublic } from '@/lib/supabaseAdmin';
import { loginSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await readJson(request));
    const authClient = getSupabasePublic();
    const { data, error } = await authClient.auth.signInWithPassword(input);
    if (error || !data.user || !data.session) {
      throw new ApiError(401, 'LOGIN_FAILED', 'Email or password is incorrect, or the account is not ready to sign in.');
    }

    const db = getSupabaseAdmin();
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id, account_type, full_name')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new ApiError(409, 'PROFILE_REQUIRED', 'Account profile is missing.');

    return NextResponse.json({
      user: { id: data.user.id, email: data.user.email },
      profile,
      session: data.session,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
