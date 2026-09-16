import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson, ApiError } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { requireEmployerMembership } from '@/lib/authorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runMatching } from '@/lib/runMatching';
import { jobCreateSchema } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url = new URL(request.url);
    const employerId = url.searchParams.get('employerId');
    if (!employerId) throw new ApiError(400, 'EMPLOYER_ID_REQUIRED', 'employerId is required.');
    await requireEmployerMembership(auth, employerId);

    const db = getSupabaseAdmin();
    const { data, error } = await db.from('jobs')
      .select('*, employer_locations(id,name,city,region,country), job_required_certifications(name), job_shifts(weekday,start_time,end_time)')
      .eq('employer_id', employerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ jobs: data ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  let jobId: string | null = null;

  try {
    const auth = await requireAuth(request);
    const input = jobCreateSchema.parse(await readJson(request));
    await requireEmployerMembership(auth, input.employerId, ['owner', 'admin', 'recruiter']);

    let latitude = input.latitude;
    let longitude = input.longitude;
    if (input.locationId) {
      const { data: location, error: locationError } = await db.from('employer_locations')
        .select('id, employer_id, latitude, longitude')
        .eq('id', input.locationId)
        .eq('employer_id', input.employerId)
        .maybeSingle();
      if (locationError) throw locationError;
      if (!location) throw new ApiError(400, 'INVALID_JOB_LOCATION', 'locationId does not belong to this employer.');
      latitude = location.latitude;
      longitude = location.longitude;
    }
    if (latitude == null || longitude == null) throw new ApiError(400, 'JOB_LOCATION_REQUIRED', 'Job coordinates are required.');

    const { data: job, error: jobError } = await db.from('jobs').insert({
      employer_id: input.employerId,
      location_id: input.locationId ?? null,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      hourly_rate: input.hourlyRate,
      max_hourly_rate: input.maxHourlyRate ?? null,
      currency: input.currency,
      weekly_hours: input.weeklyHours ?? null,
      min_experience_months: input.minExperienceMonths,
      employment_type: input.employmentType ?? null,
      workplace_type: input.workplaceType ?? null,
      latitude,
      longitude,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      closing_date: input.closingDate ?? null,
      openings: input.openings,
      metadata: input.metadata,
      status: 'open',
    }).select('*').single();
    if (jobError) throw jobError;
    jobId = job.id;

    const uniqueCerts = [...new Set(input.requiredCertifications.map((name) => name.trim()).filter(Boolean))];
    if (uniqueCerts.length) {
      const { error } = await db.from('job_required_certifications').insert(
        uniqueCerts.map((name) => ({ job_id: job.id, name })),
      );
      if (error) throw error;
    }

    const { error: shiftError } = await db.from('job_shifts').insert(input.shifts.map((shift) => ({
      job_id: job.id,
      weekday: shift.weekday,
      start_time: shift.startTime,
      end_time: shift.endTime,
    })));
    if (shiftError) throw shiftError;

    let matching: Awaited<ReturnType<typeof runMatching>> | null = null;
    let matchingWarning: string | null = null;
    try {
      matching = await runMatching({ jobId: job.id });
    } catch (matchError: any) {
      matchingWarning = matchError?.message ?? 'Job was created, but automatic matching failed.';
    }

    return NextResponse.json({ job, matching, matchingWarning }, { status: 201 });
  } catch (error) {
    if (jobId) await db.from('jobs').delete().eq('id', jobId);
    return apiErrorResponse(error);
  }
}
