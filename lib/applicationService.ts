import { ApiError } from './api';
import type { AuthContext } from './auth';
import { assertApplicationTransition, type ApplicationActor, type ApplicationStatus } from './applicationState';
import { getEmployerMembership, getWorkerForUser, canRecruit } from './authorization';
import { getSupabaseAdmin } from './supabaseAdmin';

export async function transitionApplicationForUser(args: {
  applicationId: string;
  to: ApplicationStatus;
  reason?: string | null;
  auth: AuthContext;
}) {
  const db = getSupabaseAdmin();
  const { data: application, error } = await db
    .from('applications')
    .select('id, worker_id, job_id, status')
    .eq('id', args.applicationId)
    .maybeSingle();
  if (error) throw error;
  if (!application) throw new ApiError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');

  let actor: ApplicationActor | null = null;
  const worker = await getWorkerForUser(args.auth.user.id);
  if (worker?.id === application.worker_id) {
    actor = 'worker';
  } else {
    const { data: job, error: jobError } = await db
      .from('jobs')
      .select('employer_id')
      .eq('id', application.job_id)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) throw new ApiError(409, 'APPLICATION_JOB_MISSING', 'The job for this application no longer exists.');

    const membership = await getEmployerMembership(args.auth.user.id, job.employer_id);
    if (membership && canRecruit(membership.role)) actor = 'employer';
  }

  if (!actor) throw new ApiError(403, 'APPLICATION_ACCESS_DENIED', 'You cannot change this application.');

  const from = application.status as ApplicationStatus;
  try {
    assertApplicationTransition(from, args.to, actor);
  } catch (transitionError: any) {
    throw new ApiError(409, transitionError.code ?? 'INVALID_APPLICATION_TRANSITION', transitionError.message);
  }

  const { data: transitioned, error: transitionError } = await db.rpc('transition_application_service', {
    p_application_id: application.id,
    p_expected_status: from,
    p_to_status: args.to,
    p_actor_user_id: args.auth.user.id,
    p_actor_type: actor,
    p_reason: args.reason ?? null,
  });

  if (transitionError) {
    if (transitionError.message?.includes('APPLICATION_STATE_CHANGED')) {
      throw new ApiError(409, 'APPLICATION_STATE_CHANGED', 'Application changed before this action completed. Refresh and try again.');
    }
    throw transitionError;
  }

  if (args.to === 'hired') {
    const { data: job, error: jobError } = await db.from('jobs')
      .select('id, openings, status')
      .eq('id', application.job_id)
      .maybeSingle();
    if (jobError) throw jobError;
    if (job?.status === 'open') {
      const { count, error: countError } = await db.from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', application.job_id)
        .eq('status', 'hired');
      if (countError) throw countError;
      if ((count ?? 0) >= job.openings) {
        const { error: closeError } = await db.from('jobs').update({ status: 'closed' }).eq('id', application.job_id);
        if (closeError) throw closeError;
      }
    }
  }

  return transitioned;
}
