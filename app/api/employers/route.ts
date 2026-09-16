import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson } from '@/lib/api';
import { requireAccountType } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { employerCreateSchema } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    const auth = await requireAccountType(request, 'employer');
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('employer_memberships')
      .select('role, employers(*, employer_locations(*))')
      .eq('user_id', auth.user.id);
    if (error) throw error;
    return NextResponse.json({ employers: data ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  let employerId: string | null = null;
  try {
    const auth = await requireAccountType(request, 'employer');
    const input = employerCreateSchema.parse(await readJson(request));
    const location = input.primaryLocation;
    const { data: employer, error } = await db.from('employers').insert({
      company_name: input.companyName,
      email: auth.user.email ?? '',
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
    }).select('*').single();
    if (error) throw error;
    employerId = employer.id;

    const { error: membershipError } = await db.from('employer_memberships').insert({
      employer_id: employer.id,
      user_id: auth.user.id,
      role: 'owner',
    });
    if (membershipError) throw membershipError;

    let primaryLocation = null;
    if (location) {
      const { data: createdLocation, error: locationError } = await db.from('employer_locations').insert({
        employer_id: employer.id,
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
        is_default: true,
      }).select('*').single();
      if (locationError) throw locationError;
      primaryLocation = createdLocation;
    }

    return NextResponse.json({ employer, membership: { role: 'owner' }, primaryLocation }, { status: 201 });
  } catch (error) {
    if (employerId) await db.from('employers').delete().eq('id', employerId);
    return apiErrorResponse(error);
  }
}
