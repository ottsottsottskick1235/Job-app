import { NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, parseLimit, parseOffset } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { getWorkerForUser, requireEmployerMembership } from '@/lib/authorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url = new URL(request.url);
    const params = url.searchParams;
    const limit = parseLimit(params.get('limit'), 25, 100);
    const offset = parseOffset(params.get('offset'));
    const statuses = params.getAll('status').flatMap((value) => value.split(',')).filter(Boolean);
    const jobId = params.get('jobId');
    const minScore = params.get('minScore') == null ? null : Number(params.get('minScore'));
    if (minScore != null && !Number.isFinite(minScore)) throw new ApiError(400, 'INVALID_FILTER', 'minScore must be a number.');

    const db = getSupabaseAdmin();
    let query = db.from('applications').select('*', { count: 'exact' });

    if (auth.profile.account_type === 'worker') {
      const worker = await getWorkerForUser(auth.user.id);
      if (!worker) return NextResponse.json({ applications: [], pagination: { limit, offset, total: 0, hasMore: false } });
      query = query.eq('worker_id', worker.id);
    } else {
      const employerId = params.get('employerId');
      if (!employerId) throw new ApiError(400, 'EMPLOYER_ID_REQUIRED', 'employerId is required for employer application views.');
      await requireEmployerMembership(auth, employerId);
      const { data: employerJobs, error: jobsError } = await db.from('jobs').select('id').eq('employer_id', employerId);
      if (jobsError) throw jobsError;
      const jobIds = (employerJobs ?? []).map((job) => job.id);
      if (!jobIds.length) return NextResponse.json({ applications: [], pagination: { limit, offset, total: 0, hasMore: false } });
      query = query.in('job_id', jobIds);
    }

    if (statuses.length) query = query.in('status', statuses);
    if (jobId) query = query.eq('job_id', jobId);
    if (minScore != null) query = query.gte('match_score', minScore);

    const { data: applications, error, count } = await query
      .order('matched_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const workerIds = [...new Set((applications ?? []).map((application) => application.worker_id))];
    const jobIds = [...new Set((applications ?? []).map((application) => application.job_id))];
    const [workersResult, jobsResult] = await Promise.all([
      workerIds.length ? db.from('workers').select('id, full_name, preferred_roles, experience_months').in('id', workerIds) : Promise.resolve({ data: [], error: null }),
      jobIds.length ? db.from('jobs').select('id, title, category, hourly_rate, employer_id, status').in('id', jobIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (workersResult.error) throw workersResult.error;
    if (jobsResult.error) throw jobsResult.error;
    const workers = new Map((workersResult.data ?? []).map((worker) => [worker.id, worker]));
    const jobs = new Map((jobsResult.data ?? []).map((job) => [job.id, job]));

    const enriched = (applications ?? []).map((application) => ({
      ...application,
      worker: workers.get(application.worker_id) ?? null,
      job: jobs.get(application.job_id) ?? null,
    }));

    return NextResponse.json({
      applications: enriched,
      pagination: { limit, offset, total: count ?? enriched.length, hasMore: offset + enriched.length < (count ?? enriched.length) },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
