import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const db = getSupabaseAdmin();
    const [workerResult, membershipsResult] = await Promise.all([
      db.from('workers').select('id, full_name, active').eq('user_id', auth.user.id).maybeSingle(),
      db.from('employer_memberships')
        .select('employer_id, role, employers(id, company_name)')
        .eq('user_id', auth.user.id),
    ]);
    if (workerResult.error) throw workerResult.error;
    if (membershipsResult.error) throw membershipsResult.error;

    return NextResponse.json({
      user: { id: auth.user.id, email: auth.user.email },
      profile: auth.profile,
      worker: workerResult.data,
      employerMemberships: membershipsResult.data ?? [],
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
