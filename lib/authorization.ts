import { ApiError } from './api';
import type { AuthContext } from './auth';
import { getSupabaseAdmin } from './supabaseAdmin';

export type EmployerRole = 'owner' | 'admin' | 'recruiter' | 'viewer';

export async function getWorkerForUser(userId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('workers').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function requireWorkerForUser(userId: string) {
  const worker = await getWorkerForUser(userId);
  if (!worker) throw new ApiError(404, 'WORKER_PROFILE_NOT_FOUND', 'Worker profile has not been created yet.');
  return worker;
}

export async function getEmployerMembership(userId: string, employerId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('employer_memberships')
    .select('employer_id, user_id, role')
    .eq('employer_id', employerId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as { employer_id: string; user_id: string; role: EmployerRole } | null;
}

export async function requireEmployerMembership(
  auth: AuthContext,
  employerId: string,
  allowedRoles: EmployerRole[] = ['owner', 'admin', 'recruiter', 'viewer'],
) {
  const membership = await getEmployerMembership(auth.user.id, employerId);
  if (!membership) throw new ApiError(403, 'EMPLOYER_ACCESS_DENIED', 'You do not belong to this employer.');
  if (!allowedRoles.includes(membership.role)) {
    throw new ApiError(403, 'EMPLOYER_ROLE_FORBIDDEN', `Your employer role cannot perform this action.`);
  }
  return membership;
}

export function canManageEmployer(role: EmployerRole) {
  return role === 'owner' || role === 'admin';
}

export function canRecruit(role: EmployerRole) {
  return role === 'owner' || role === 'admin' || role === 'recruiter';
}
