import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson, ApiError } from '@/lib/api';
import { requireAccountType } from '@/lib/auth';
import { requireWorkerForUser } from '@/lib/authorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runMatching } from '@/lib/runMatching';
import { workerProfileSchema } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    const auth = await requireAccountType(request, 'worker');
    const worker = await requireWorkerForUser(auth.user.id);
    const db = getSupabaseAdmin();
    const [certifications, availability, locations] = await Promise.all([
      db.from('worker_certifications').select('*').eq('worker_id', worker.id).order('name'),
      db.from('worker_availability').select('*').eq('worker_id', worker.id).order('weekday').order('start_time'),
      db.from('worker_locations').select('*').eq('worker_id', worker.id).order('is_primary', { ascending: false }),
    ]);
    if (certifications.error) throw certifications.error;
    if (availability.error) throw availability.error;
    if (locations.error) throw locations.error;
    return NextResponse.json({ worker: { ...worker, certifications: certifications.data, availability: availability.data, locations: locations.data } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAccountType(request, 'worker');
    const worker = await requireWorkerForUser(auth.user.id);
    const input = workerProfileSchema.parse(await readJson(request));
    const db = getSupabaseAdmin();
    const location = input.primaryLocation;

    const { error: workerError } = await db.from('workers').update({
      full_name: input.fullName,
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
    }).eq('id', worker.id);
    if (workerError) throw workerError;

    const uniqueCerts: Array<{ name: string; expiresOn?: string | null }> = [...new Map<string, { name: string; expiresOn?: string | null }>(input.certifications.map((cert: { name: string; expiresOn?: string | null }) => [cert.name.trim().toLowerCase(), cert])).values()];
    const { error: deleteCertsError } = await db.from('worker_certifications').delete().eq('worker_id', worker.id);
    if (deleteCertsError) throw deleteCertsError;
    if (uniqueCerts.length) {
      const { error } = await db.from('worker_certifications').insert(uniqueCerts.map((cert) => ({
        worker_id: worker.id, name: cert.name, expires_on: cert.expiresOn ?? null,
      })));
      if (error) throw error;
    }

    const { error: deleteAvailabilityError } = await db.from('worker_availability').delete().eq('worker_id', worker.id);
    if (deleteAvailabilityError) throw deleteAvailabilityError;
    const { error: availabilityError } = await db.from('worker_availability').insert(input.availability.map((block: { weekday: number; startTime: string; endTime: string }) => ({
      worker_id: worker.id, weekday: block.weekday, start_time: block.startTime, end_time: block.endTime,
    })));
    if (availabilityError) throw availabilityError;

    const { data: primaryLocation, error: primaryError } = await db.from('worker_locations')
      .select('id').eq('worker_id', worker.id).eq('is_primary', true).maybeSingle();
    if (primaryError) throw primaryError;

    const locationRow = {
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
    };
    if (primaryLocation) {
      const { error } = await db.from('worker_locations').update(locationRow).eq('id', primaryLocation.id);
      if (error) throw error;
    } else {
      const { error } = await db.from('worker_locations').insert({ worker_id: worker.id, ...locationRow });
      if (error) throw error;
    }

    await db.from('profiles').update({ full_name: input.fullName }).eq('id', auth.user.id);

    const matching = await runMatching({ workerId: worker.id });
    return NextResponse.json({ workerId: worker.id, matching });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAccountType(request, 'worker');
    const worker = await requireWorkerForUser(auth.user.id);
    const db = getSupabaseAdmin();
    const { error } = await db.from('workers').update({ active: false }).eq('id', worker.id);
    if (error) throw error;
    return NextResponse.json({ workerId: worker.id, active: false });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
