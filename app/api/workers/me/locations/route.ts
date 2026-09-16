import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson } from '@/lib/api';
import { requireAccountType } from '@/lib/auth';
import { requireWorkerForUser } from '@/lib/authorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { locationInputSchema } from '@/lib/validation';
import { z } from 'zod';

const schema = locationInputSchema.extend({ isPrimary: z.boolean().default(false) });

export async function GET(request: Request) {
  try {
    const auth = await requireAccountType(request, 'worker');
    const worker = await requireWorkerForUser(auth.user.id);
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('worker_locations').select('*')
      .eq('worker_id', worker.id).order('is_primary', { ascending: false }).order('name');
    if (error) throw error;
    return NextResponse.json({ locations: data ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAccountType(request, 'worker');
    const worker = await requireWorkerForUser(auth.user.id);
    const input = schema.parse(await readJson(request));
    const db = getSupabaseAdmin();
    if (input.isPrimary) {
      const { error } = await db.from('worker_locations').update({ is_primary: false })
        .eq('worker_id', worker.id).eq('is_primary', true);
      if (error) throw error;
    }
    const { data, error } = await db.from('worker_locations').insert({
      worker_id: worker.id,
      name: input.name,
      address_line1: input.addressLine1 ?? null,
      address_line2: input.addressLine2 ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      postal_code: input.postalCode ?? null,
      country: input.country ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      display_name: input.displayName ?? null,
      geocode_provider: input.geocodeProvider ?? null,
      geocode_place_id: input.geocodePlaceId ?? null,
      geocoded_at: input.geocodeProvider ? new Date().toISOString() : null,
      is_primary: input.isPrimary,
    }).select('*').single();
    if (error) throw error;
    if (input.isPrimary) {
      const { error: workerError } = await db.from('workers').update({ latitude: input.latitude, longitude: input.longitude }).eq('id', worker.id);
      if (workerError) throw workerError;
    }
    return NextResponse.json({ location: data }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
