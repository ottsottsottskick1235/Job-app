import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { savedSearchSchema } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const type = new URL(request.url).searchParams.get('type');
    const db = getSupabaseAdmin();
    let query = db.from('saved_searches').select('*').eq('user_id', auth.user.id).order('updated_at', { ascending: false });
    if (type) query = query.eq('search_type', type);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ savedSearches: data ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const input = savedSearchSchema.parse(await readJson(request));
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('saved_searches').upsert({
      user_id: auth.user.id,
      name: input.name,
      search_type: input.searchType,
      filters: input.filters,
      sort: input.sort ?? null,
    }, { onConflict: 'user_id,name,search_type' }).select('*').single();
    if (error) throw error;
    return NextResponse.json({ savedSearch: data }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
