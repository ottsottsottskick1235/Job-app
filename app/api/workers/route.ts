import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runMatching } from '@/lib/runMatching';

const timeBlock = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().min(4),
  endTime: z.string().min(4),
});

const schema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  preferredRoles: z.array(z.string().min(1)).min(1),
  minHourlyRate: z.number().nonnegative(),
  maxTravelKm: z.number().positive(),
  minWeeklyHours: z.number().int().nonnegative().nullable().optional(),
  maxWeeklyHours: z.number().int().nonnegative().nullable().optional(),
  experienceMonths: z.number().int().nonnegative(),
  latitude: z.number(),
  longitude: z.number(),
  certifications: z.array(z.object({
    name: z.string().min(1),
    expiresOn: z.string().nullable().optional(),
  })).default([]),
  availability: z.array(timeBlock).min(1),
});

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  let workerId: string | null = null;

  try {
    const input = schema.parse(await request.json());
    const { data: worker, error: workerError } = await db.from('workers').insert({
      full_name: input.fullName,
      email: input.email,
      preferred_roles: input.preferredRoles,
      min_hourly_rate: input.minHourlyRate,
      max_travel_km: input.maxTravelKm,
      min_weekly_hours: input.minWeeklyHours ?? null,
      max_weekly_hours: input.maxWeeklyHours ?? null,
      experience_months: input.experienceMonths,
      latitude: input.latitude,
      longitude: input.longitude,
    }).select('*').single();

    if (workerError) throw workerError;
    workerId = worker.id;

    if (input.certifications.length) {
      const { error } = await db.from('worker_certifications').insert(
        input.certifications.map((cert) => ({
          worker_id: worker.id,
          name: cert.name,
          expires_on: cert.expiresOn ?? null,
        }))
      );
      if (error) throw error;
    }

    const { error: availabilityError } = await db.from('worker_availability').insert(
      input.availability.map((block) => ({
        worker_id: worker.id,
        weekday: block.weekday,
        start_time: block.startTime,
        end_time: block.endTime,
      }))
    );
    if (availabilityError) throw availabilityError;

    let matching = null;
    let matchingWarning = null;
    try {
      matching = await runMatching({ workerId: worker.id });
    } catch (error: any) {
      matchingWarning = error.message ?? 'Worker was created, but automatic matching failed.';
    }

    return NextResponse.json({ worker, matching, matchingWarning }, { status: 201 });
  } catch (error: any) {
    if (workerId) await db.from('workers').delete().eq('id', workerId);
    return NextResponse.json({ error: error.message ?? 'Invalid request' }, { status: 400 });
  }
}
