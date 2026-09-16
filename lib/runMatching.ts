import { getSupabaseAdmin } from './supabaseAdmin';
import { evaluateMatch } from './matching';
import { jobFromRows, workerFromRows } from './dbShape';

type RunMatchingOptions = {
  workerId?: string;
  jobId?: string;
};

export async function runMatching(options: RunMatchingOptions = {}) {
  const db = getSupabaseAdmin();

  let workersQuery = db.from('workers').select('*').eq('active', true);
  if (options.workerId) workersQuery = workersQuery.eq('id', options.workerId);
  const { data: workers, error: workersError } = await workersQuery;
  if (workersError) throw workersError;

  let jobsQuery = db.from('jobs').select('*').eq('status', 'open');
  if (options.jobId) jobsQuery = jobsQuery.eq('id', options.jobId);
  const { data: jobs, error: jobsError } = await jobsQuery;
  if (jobsError) throw jobsError;

  if (!workers?.length || !jobs?.length) {
    return { checkedPairs: 0, newApplications: 0, applications: [] };
  }

  const workerIds = workers.map((worker) => worker.id);
  const jobIds = jobs.map((job) => job.id);

  const { data: workerCerts, error: wcError } = await db
    .from('worker_certifications').select('*').in('worker_id', workerIds);
  if (wcError) throw wcError;

  const { data: workerAvailability, error: waError } = await db
    .from('worker_availability').select('*').in('worker_id', workerIds);
  if (waError) throw waError;

  const { data: jobCerts, error: jcError } = await db
    .from('job_required_certifications').select('*').in('job_id', jobIds);
  if (jcError) throw jcError;

  const { data: jobShifts, error: jsError } = await db
    .from('job_shifts').select('*').in('job_id', jobIds);
  if (jsError) throw jsError;

  let checked = 0;
  let matched = 0;
  const created: unknown[] = [];

  for (const workerRow of workers) {
    const worker = workerFromRows(
      workerRow,
      (workerCerts ?? []).filter((row) => row.worker_id === workerRow.id),
      (workerAvailability ?? []).filter((row) => row.worker_id === workerRow.id),
    );

    for (const jobRow of jobs) {
      checked += 1;
      const job = jobFromRows(
        jobRow,
        (jobCerts ?? []).filter((row) => row.job_id === jobRow.id),
        (jobShifts ?? []).filter((row) => row.job_id === jobRow.id),
      );

      const result = evaluateMatch(worker, job);
      if (!result.eligible) continue;

      const { data, error } = await db.from('applications').upsert({
        worker_id: worker.id,
        job_id: job.id,
        status: 'submitted',
        match_reasons: [],
      }, {
        onConflict: 'worker_id,job_id',
        ignoreDuplicates: true,
      }).select('*');

      if (error) throw error;
      if (data?.length) {
        matched += 1;
        created.push(data[0]);
      }
    }
  }

  return { checkedPairs: checked, newApplications: matched, applications: created };
}
