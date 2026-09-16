import { NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, parseLimit, parseOffset } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { requireEmployerMembership } from '@/lib/authorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const db = getSupabaseAdmin();
    const { data: job, error: jobError } = await db.from('jobs').select('id, employer_id, title').eq('id', id).maybeSingle();
    if (jobError) throw jobError;
    if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job was not found.');
    await requireEmployerMembership(auth, job.employer_id, ['owner', 'admin', 'recruiter', 'viewer']);

    const url = new URL(request.url);
    const params = url.searchParams;
    const limit = parseLimit(params.get('limit'), 25, 100);
    const offset = parseOffset(params.get('offset'));
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const statuses = params.getAll('status').flatMap((value) => value.split(',')).filter(Boolean);
    const minScore = params.get('minScore') == null ? null : Number(params.get('minScore'));
    const maxScore = params.get('maxScore') == null ? null : Number(params.get('maxScore'));
    if ((minScore != null && !Number.isFinite(minScore)) || (maxScore != null && !Number.isFinite(maxScore))) {
      throw new ApiError(400, 'INVALID_FILTER', 'Score filters must be numbers.');
    }

    const { data: applications, error: applicationsError } = await db.from('applications')
      .select('*').eq('job_id', id).order('match_score', { ascending: false, nullsFirst: false });
    if (applicationsError) throw applicationsError;
    const workerIds = [...new Set((applications ?? []).map((item) => item.worker_id))];
    if (!workerIds.length) return NextResponse.json({ job, candidates: [], pagination: { limit, offset, total: 0, hasMore: false } });

    const [workersResult, certsResult] = await Promise.all([
      db.from('workers').select('*').in('id', workerIds),
      db.from('worker_certifications').select('*').in('worker_id', workerIds),
    ]);
    if (workersResult.error) throw workersResult.error;
    if (certsResult.error) throw certsResult.error;
    const workers = new Map<string, any>((workersResult.data ?? []).map((worker: any) => [worker.id, worker]));
    const certs = certsResult.data ?? [];

    const candidates = (applications ?? []).map((application) => {
      const worker = workers.get(application.worker_id);
      return {
        application,
        worker: worker ? {
          ...worker,
          certifications: certs.filter((cert: any) => cert.worker_id === worker.id),
        } : null,
      };
    }).filter((candidate) => {
      if (!candidate.worker) return false;
      if (statuses.length && !statuses.includes(candidate.application.status)) return false;
      const score = candidate.application.match_score == null ? null : Number(candidate.application.match_score);
      if (minScore != null && (score == null || score < minScore)) return false;
      if (maxScore != null && (score == null || score > maxScore)) return false;
      if (q) {
        const haystack = `${candidate.worker.full_name} ${(candidate.worker.preferred_roles ?? []).join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const page = candidates.slice(offset, offset + limit);
    return NextResponse.json({
      job,
      candidates: page,
      pagination: { limit, offset, total: candidates.length, hasMore: offset + limit < candidates.length },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
