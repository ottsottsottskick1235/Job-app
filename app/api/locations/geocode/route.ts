import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { geocodeWithNominatim, normalizeGeocodeQuery } from '@/lib/geocoding';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { geocodeRequestSchema } from '@/lib/validation';

const CACHE_DAYS = 30;

export async function POST(request: Request) {
  try {
    await requireAuth(request);
    const input = geocodeRequestSchema.parse(await readJson(request));
    const key = normalizeGeocodeQuery(input.query);
    const db = getSupabaseAdmin();

    const { data: cached, error: cacheError } = await db.from('geocode_cache')
      .select('results, expires_at')
      .eq('query_key', key)
      .maybeSingle();
    if (cacheError) throw cacheError;
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return NextResponse.json({ results: cached.results, cached: true });
    }

    const results = await geocodeWithNominatim(input.query, {
      baseUrl: process.env.GEOCODING_BASE_URL,
      userAgent: process.env.GEOCODING_USER_AGENT,
    });
    const expiresAt = new Date(Date.now() + CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: upsertError } = await db.from('geocode_cache').upsert({
      query_key: key,
      query_text: input.query,
      provider: 'nominatim',
      results,
      expires_at: expiresAt,
    }, { onConflict: 'query_key' });
    if (upsertError) throw upsertError;

    return NextResponse.json({ results, cached: false });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
