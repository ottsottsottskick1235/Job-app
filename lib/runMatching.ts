import { getSupabaseAdmin } from './supabaseAdmin';
import { evaluateMatch, MATCHER_VERSION } from './matching';
import { jobFromRows, workerFromRows } from './dbShape';

type RunMatchingOptions = {
  workerId?: string;
  jobId?: string;
};

function pairKey(workerId: string, jobId: string) {
  return `${workerId}:${jobId}`;
}

export async function runMatching(options: RunMatchingOptions = {}) {
  const db = getSupabaseAdmin();
  const scope = options.workerId ? 'worker' : options.jobId ? 'job' : 'all';
  let runId: string | null = null;

  try {
    const { data: run } = await db.from('matching_runs').insert({
      scope,
      worker_id: options.workerId ?? null,
      job_id: options.jobId ?? null,
      matcher_version: MATCHER_VERSION,
    }).select('id').maybeSingle();
    runId = run?.id ?? null;
  } catch {
    // Matching itself remains available if logging has not been migrated yet.
  }

  try {
    let workersQuery = db.from('workers').select('*').eq('active', true);
    if (options.workerId) workersQuery = workersQuery.eq('id', options.workerId);
    const { data: workers, error: workersError } = await workersQuery;
    if (workersError) throw workersError;

    const today = new Date().toISOString().slice(0, 10);
    let jobsQuery = db.from('jobs').select('*').eq('status', 'open').or(`closing_date.is.null,closing_date.gte.${today}`);
    if (options.jobId) jobsQuery = jobsQuery.eq('id', options.jobId);
    const { data: jobs, error: jobsError } = await jobsQuery;
    if (jobsError) throw jobsError;

    if (!workers?.length || !jobs?.length) {
      if (runId) await db.from('matching_runs').update({ finished_at: new Date().toISOString() }).eq('id', runId);
      return { checkedPairs: 0, newApplications: 0, updatedApplications: 0, applications: [], matcherVersion: MATCHER_VERSION };
    }

    const workerIds = workers.map((worker) => worker.id);
    const jobIds = jobs.map((job) => job.id);

    const [workerCertsResult, availabilityResult, jobCertsResult, shiftsResult, existingResult] = await Promise.all([
      db.from('worker_certifications').select('*').in('worker_id', workerIds),
      db.from('worker_availability').select('*').in('worker_id', workerIds),
      db.from('job_required_certifications').select('*').in('job_id', jobIds),
      db.from('job_shifts').select('*').in('job_id', jobIds),
      db.from('applications').select('id, worker_id, job_id, status, match_score').in('worker_id', workerIds).in('job_id', jobIds),
    ]);

    for (const result of [workerCertsResult, availabilityResult, jobCertsResult, shiftsResult, existingResult]) {
      if (result.error) throw result.error;
    }

    const workerCerts = workerCertsResult.data ?? [];
    const workerAvailability = availabilityResult.data ?? [];
    const jobCerts = jobCertsResult.data ?? [];
    const jobShifts = shiftsResult.data ?? [];
    const existingApplications = new Map<string, any>(
      (existingResult.data ?? []).map((row: any) => [pairKey(row.worker_id, row.job_id), row]),
    );

    let checked = 0;
    let createdCount = 0;
    let updatedCount = 0;
    const created: unknown[] = [];

    for (const workerRow of workers) {
      const worker = workerFromRows(
        workerRow,
        workerCerts.filter((row) => row.worker_id === workerRow.id),
        workerAvailability.filter((row) => row.worker_id === workerRow.id),
      );

      for (const jobRow of jobs) {
        checked += 1;
        const job = jobFromRows(
          jobRow,
          jobCerts.filter((row) => row.job_id === jobRow.id),
          jobShifts.filter((row) => row.job_id === jobRow.id),
        );

        const result = evaluateMatch(worker, job);
        if (!result.eligible) continue;

        const key = pairKey(worker.id, job.id);
        const existing = existingApplications.get(key);
        const matchFields = {
          match_score: result.score,
          match_breakdown: result.scoreBreakdown,
          matcher_version: result.matcherVersion,
        };

        if (existing) {
          const { error } = await db.from('applications').update(matchFields).eq('id', existing.id);
          if (error) throw error;
          updatedCount += 1;
          continue;
        }

        const { data, error } = await db.from('applications').insert({
          worker_id: worker.id,
          job_id: job.id,
          status: 'submitted',
          match_reasons: [],
          ...matchFields,
        }).select('*').single();
        if (error) throw error;

        createdCount += 1;
        created.push(data);
        existingApplications.set(key, data);

        const { error: eventError } = await db.from('application_events').insert({
          application_id: data.id,
          actor_type: 'system',
          from_status: null,
          to_status: 'submitted',
          metadata: { matcherVersion: result.matcherVersion, score: result.score },
        });
        if (eventError) throw eventError;
      }
    }

    if (runId) {
      await db.from('matching_runs').update({
        checked_pairs: checked,
        new_applications: createdCount,
        updated_applications: updatedCount,
        finished_at: new Date().toISOString(),
      }).eq('id', runId);
    }

    return {
      checkedPairs: checked,
      newApplications: createdCount,
      updatedApplications: updatedCount,
      applications: created,
      matcherVersion: MATCHER_VERSION,
    };
  } catch (error: any) {
    if (runId) {
      await db.from('matching_runs').update({
        error_message: error?.message ?? 'Matching failed',
        finished_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    throw error;
  }
}
