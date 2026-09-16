import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { requireEmployerMembership } from '@/lib/authorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { employerLocationSchema } from '@/lib/validation';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    await requireEmployerMembership(auth, id);
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('employer_locations')
      .select('*').eq('employer_id', id).order('is_default', { ascending: false }).order('name');
    if (error) throw error;
    return NextResponse.json({ locations: data ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    await requireEmployerMembership(auth, id, ['owner', 'admin']);
    const input = employerLocationSchema.parse(await readJson(request));
    const db = getSupabaseAdmin();

    if (input.isDefault) {
      const { error } = await db.from('employer_locations').update({ is_default: false }).eq('employer_id', id).eq('is_default', true);
      if (error) throw error;
    }

    const { data, error } = await db.from('employer_locations').insert({
      employer_id: id,
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
      is_default: input.isDefault,
    }).select('*').single();
    if (error) throw error;

    if (input.isDefault) {
      await db.from('employers').update({ latitude: input.latitude, longitude: input.longitude }).eq('id', id);
    }

    return NextResponse.json({ location: data }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
