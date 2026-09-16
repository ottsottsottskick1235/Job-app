import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson, ApiError } from '@/lib/api';
import { getSupabaseAdmin, getSupabasePublic } from '@/lib/supabaseAdmin';
import { signupSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const input = signupSchema.parse(await readJson(request));
    const authClient = getSupabasePublic();
    const { data, error } = await authClient.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { account_type: input.accountType, full_name: input.fullName } },
    });
    if (error) throw new ApiError(400, 'SIGNUP_FAILED', error.message);
    if (!data.user) throw new ApiError(500, 'SIGNUP_FAILED', 'Authentication provider did not return a user.');

    // The DB trigger normally creates this profile. Upsert is a defensive fallback.
    const db = getSupabaseAdmin();
    const { error: profileError } = await db.from('profiles').upsert({
      id: data.user.id,
      account_type: input.accountType,
      full_name: input.fullName,
    }, { onConflict: 'id' });
    if (profileError) throw profileError;

    return NextResponse.json({
      user: { id: data.user.id, email: data.user.email },
      accountType: input.accountType,
      session: data.session,
      requiresEmailConfirmation: !data.session,
    }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
