import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson, ApiError } from '@/lib/api';
import { requireAccountType } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runMatching } from '@/lib/runMatching';
import { workerProfileSchema } from '@/lib/validation';

async function loadWorkerBundle(userId: string) {
  const db = getSupabaseAdmin();
  const { data: worker, error } = await db.from('workers').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!worker) return null;
  const [certs, availability, locations] = await Promise.all([
    db.from('worker_certifications').select('*').eq('worker_id', worker.id).order('name'),
    db.from('worker_availability').select('*').eq('worker_id', worker.id).order('weekday').order('start_time'),
    db.from('worker_locations').select('*').eq('worker_id', worker.id).order('is_primary', { ascending: false }),
  ]);
  if (certs.error) throw certs.error;
  if (availability.error) throw availability.error;
  if (locations.error) throw locations.error;
  return { ...worker, certifications: certs.data ?? [], availability: availability.data ?? [], locations: locations.data ?? [] };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAccountType(request, 'worker');
    const worker = await loadWorkerBundle(auth.user.id);
    if (!worker) throw new ApiError(404, 'WORKER_PROFILE_NOT_FOUND', 'Worker profile has not been created yet.');
    return NextResponse.json({ worker });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  let workerId: string | null = null;

  try {
    const auth = await requireAccountType(request, 'worker');
    const existing = await loadWorkerBundle(auth.user.id);
    if (existing) throw new ApiError(409, 'WORKER_PROFILE_EXISTS', 'Worker profile already exists. Use /api/workers/me to update it.');

    const input = workerProfileSchema.parse(await readJson(request));
    const location = input.primaryLocation;
    const { data: worker, error: workerError } = await db.from('workers').insert({
      user_id: auth.user.id,
      full_name: input.fullName,
      email: auth.user.email ?? '',
      preferred_roles: [...new Set(input.preferredRoles)],
      preferred_employment_types: [...new Set(input.preferredEmploymentTypes)],
      preferred_workplace_types: [...new Set(input.preferredWorkplaceTypes)],
      role_keywords: [...new Set(input.roleKeywords)],
      min_hourly_rate: input.minHourlyRate,
      max_travel_km: input.maxTravelKm,
      min_weekly_hours: input.minWeeklyHours ?? null,
      max_weekly_hours: input.maxWeeklyHours ?? null,
      experience_months: input.experienceMonths,
      latitude: location.latitude,
      longitude: location.longitude,
      active: true,
    }).select('*').single();
    if (workerError) throw workerError;
    workerId = worker.id;

    const uniqueCerts: Array<{ name: string; expiresOn?: string | null }> = [...new Map<string, { name: string; expiresOn?: string | null }>(input.certifications.map((cert: { name: string; expiresOn?: string | null }) => [cert.name.trim().toLowerCase(), cert])).values()];
    if (uniqueCerts.length) {
      const { error } = await db.from('worker_certifications').insert(uniqueCerts.map((cert) => ({
        worker_id: worker.id,
        name: cert.name,
        expires_on: cert.expiresOn ?? null,
      })));
      if (error) throw error;
    }

    const { error: availabilityError } = await db.from('worker_availability').insert(input.availability.map((block: { weekday: number; startTime: string; endTime: string }) => ({
      worker_id: worker.id,
      weekday: block.weekday,
      start_time: block.startTime,
      end_time: block.endTime,
    })));
    if (availabilityError) throw availabilityError;

    const { error: locationError } = await db.from('worker_locations').insert({
      worker_id: worker.id,
      name: location.name,
      address_line1: location.addressLine1 ?? null,
      address_line2: location.addressLine2 ?? null,
      city: location.city ?? null,
      region: location.region ?? null,
      postal_code: location.postalCode ?? null,
      country: location.country ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      display_name: location.displayName ?? null,
      geocode_provider: location.geocodeProvider ?? null,
      geocode_place_id: location.geocodePlaceId ?? null,
      geocoded_at: location.geocodeProvider ? new Date().toISOString() : null,
      is_primary: true,
    });
    if (locationError) throw locationError;

    await db.from('profiles').update({ full_name: input.fullName }).eq('id', auth.user.id);

    let matching: Awaited<ReturnType<typeof runMatching>> | null = null;
    let matchingWarning: string | null = null;
    try {
      matching = await runMatching({ workerId: worker.id });
    } catch (matchError: any) {
      matchingWarning = matchError?.message ?? 'Worker was created, but automatic matching failed.';
    }

    return NextResponse.json({ worker: await loadWorkerBundle(auth.user.id), matching, matchingWarning }, { status: 201 });
  } catch (error) {
    if (workerId) await db.from('workers').delete().eq('id', workerId);
    return apiErrorResponse(error);
  }
}
