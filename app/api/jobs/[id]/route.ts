import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorResponse, readJson, ApiError } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { requireEmployerMembership } from '@/lib/authorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runMatching } from '@/lib/runMatching';
import { employmentTypeSchema, workplaceTypeSchema } from '@/lib/validation';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  category: z.string().trim().min(1).max(120).optional(),
  hourlyRate: z.number().min(0).max(10000).optional(),
  maxHourlyRate: z.number().min(0).max(10000).nullable().optional(),
  weeklyHours: z.number().int().min(0).max(168).nullable().optional(),
  minExperienceMonths: z.number().int().min(0).max(1200).optional(),
  employmentType: employmentTypeSchema.nullable().optional(),
  workplaceType: workplaceTypeSchema.nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  closingDate: z.string().nullable().optional(),
  openings: z.number().int().min(1).max(10000).optional(),
  status: z.enum(['open', 'paused', 'closed']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function loadJob(id: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job was not found.');
  return data;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const job = await loadJob(id);
    if (job.status !== 'open') await requireEmployerMembership(auth, job.employer_id);
    const db = getSupabaseAdmin();
    const [certs, shifts, location] = await Promise.all([
      db.from('job_required_certifications').select('*').eq('job_id', id),
      db.from('job_shifts').select('*').eq('job_id', id).order('weekday').order('start_time'),
      job.location_id ? db.from('employer_locations').select('*').eq('id', job.location_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (certs.error) throw certs.error;
    if (shifts.error) throw shifts.error;
    if (location.error) throw location.error;
    return NextResponse.json({ job: { ...job, requiredCertifications: certs.data, shifts: shifts.data, location: location.data } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const existing = await loadJob(id);
    await requireEmployerMembership(auth, existing.employer_id, ['owner', 'admin', 'recruiter']);
    const input = patchSchema.parse(await readJson(request));
    const db = getSupabaseAdmin();

    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.category !== undefined) patch.category = input.category;
    if (input.hourlyRate !== undefined) patch.hourly_rate = input.hourlyRate;
    if (input.maxHourlyRate !== undefined) patch.max_hourly_rate = input.maxHourlyRate;
    if (input.weeklyHours !== undefined) patch.weekly_hours = input.weeklyHours;
    if (input.minExperienceMonths !== undefined) patch.min_experience_months = input.minExperienceMonths;
    if (input.employmentType !== undefined) patch.employment_type = input.employmentType;
    if (input.workplaceType !== undefined) patch.workplace_type = input.workplaceType;
    if (input.startDate !== undefined) patch.start_date = input.startDate;
    if (input.endDate !== undefined) patch.end_date = input.endDate;
    if (input.closingDate !== undefined) patch.closing_date = input.closingDate;
    if (input.openings !== undefined) patch.openings = input.openings;
    if (input.status !== undefined) patch.status = input.status;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const { data, error } = await db.from('jobs').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    const matching = data.status === 'open' ? await runMatching({ jobId: id }) : null;
    return NextResponse.json({ job: data, matching });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const job = await loadJob(id);
    await requireEmployerMembership(auth, job.employer_id, ['owner', 'admin']);
    const db = getSupabaseAdmin();
    const { error } = await db.from('jobs').update({ status: 'closed' }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ jobId: id, status: 'closed' });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
