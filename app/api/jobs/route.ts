import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runMatching } from '@/lib/runMatching';

const schema = z.object({
  employerId: z.string().uuid(),
  title: z.string().min(1),
  category: z.string().min(1),
  hourlyRate: z.number().nonnegative(),
  weeklyHours: z.number().int().nonnegative().nullable().optional(),
  minExperienceMonths: z.number().int().nonnegative(),
  latitude: z.number(),
  longitude: z.number(),
  startDate: z.string().nullable().optional(),
  requiredCertifications: z.array(z.string().min(1)).default([]),
  shifts: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().min(4),
    endTime: z.string().min(4),
  })).min(1),
});

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  let jobId: string | null = null;

  try {
    const input = schema.parse(await request.json());
    const { data: job, error: jobError } = await db.from('jobs').insert({
      employer_id: input.employerId,
      title: input.title,
      category: input.category,
      hourly_rate: input.hourlyRate,
      weekly_hours: input.weeklyHours ?? null,
      min_experience_months: input.minExperienceMonths,
      latitude: input.latitude,
      longitude: input.longitude,
      start_date: input.startDate || null,
    }).select('*').single();
    if (jobError) throw jobError;
    jobId = job.id;

    if (input.requiredCertifications.length) {
      const { error } = await db.from('job_required_certifications').insert(
        input.requiredCertifications.map((name) => ({ job_id: job.id, name }))
      );
      if (error) throw error;
    }

    const { error: shiftError } = await db.from('job_shifts').insert(
      input.shifts.map((shift) => ({
        job_id: job.id,
        weekday: shift.weekday,
        start_time: shift.startTime,
        end_time: shift.endTime,
      }))
    );
    if (shiftError) throw shiftError;

    let matching = null;
    let matchingWarning = null;
    try {
      matching = await runMatching({ jobId: job.id });
    } catch (error: any) {
      matchingWarning = error.message ?? 'Job was created, but automatic matching failed.';
    }

    return NextResponse.json({ job, matching, matchingWarning }, { status: 201 });
  } catch (error: any) {
    if (jobId) await db.from('jobs').delete().eq('id', jobId);
    return NextResponse.json({ error: error.message ?? 'Invalid request' }, { status: 400 });
  }
}
