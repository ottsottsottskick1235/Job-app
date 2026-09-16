import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorResponse, readJson, ApiError } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { requireEmployerMembership } from '@/lib/authorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'recruiter', 'viewer']).default('viewer'),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    await requireEmployerMembership(auth, id, ['owner', 'admin']);
    const db = getSupabaseAdmin();
    const { data: memberships, error } = await db.from('employer_memberships')
      .select('user_id, role, created_at')
      .eq('employer_id', id).order('created_at');
    if (error) throw error;
    const userIds = (memberships ?? []).map((membership) => membership.user_id);
    const { data: profiles, error: profilesError } = userIds.length
      ? await db.from('profiles').select('id, full_name, account_type').in('id', userIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return NextResponse.json({ members: (memberships ?? []).map((membership) => ({
      ...membership,
      profile: profileById.get(membership.user_id) ?? null,
    })) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    await requireEmployerMembership(auth, id, ['owner', 'admin']);
    const input = addMemberSchema.parse(await readJson(request));
    const db = getSupabaseAdmin();

    const { data: profile, error: profileError } = await db.from('profiles')
      .select('id, account_type').eq('id', input.userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.account_type !== 'employer') {
      throw new ApiError(400, 'INVALID_EMPLOYER_MEMBER', 'Target user must have an employer account.');
    }

    const { data, error } = await db.from('employer_memberships').upsert({
      employer_id: id, user_id: input.userId, role: input.role,
    }, { onConflict: 'employer_id,user_id' }).select('*').single();
    if (error) throw error;
    return NextResponse.json({ membership: data }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
