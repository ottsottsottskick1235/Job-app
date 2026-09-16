import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorResponse, readJson, ApiError } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { getWorkerForUser, requireEmployerMembership } from '@/lib/authorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runMatching } from '@/lib/runMatching';

const schema = z.object({ jobId: z.string().uuid().optional() }).default({});

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const raw = request.headers.get('content-length') === '0' ? {} : await readJson(request).catch(() => ({}));
    const input = schema.parse(raw);

    if (auth.profile.account_type === 'worker') {
      const worker = await getWorkerForUser(auth.user.id);
      if (!worker) throw new ApiError(404, 'WORKER_PROFILE_NOT_FOUND', 'Create a worker profile before running matching.');
      return NextResponse.json(await runMatching({ workerId: worker.id }));
    }

    if (!input.jobId) throw new ApiError(400, 'JOB_ID_REQUIRED', 'Employer matching runs require jobId.');
    const db = getSupabaseAdmin();
    const { data: job, error } = await db.from('jobs').select('id, employer_id').eq('id', input.jobId).maybeSingle();
    if (error) throw error;
    if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job was not found.');
    await requireEmployerMembership(auth, job.employer_id, ['owner', 'admin', 'recruiter']);
    return NextResponse.json(await runMatching({ jobId: job.id }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
