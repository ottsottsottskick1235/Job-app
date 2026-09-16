import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson, ApiError } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { savedSearchSchema } from '@/lib/validation';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const input = savedSearchSchema.parse(await readJson(request));
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('saved_searches').update({
      name: input.name,
      search_type: input.searchType,
      filters: input.filters,
      sort: input.sort ?? null,
    }).eq('id', id).eq('user_id', auth.user.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'SAVED_SEARCH_NOT_FOUND', 'Saved search was not found.');
    return NextResponse.json({ savedSearch: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('saved_searches').delete()
      .eq('id', id).eq('user_id', auth.user.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'SAVED_SEARCH_NOT_FOUND', 'Saved search was not found.');
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
