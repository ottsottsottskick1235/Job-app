import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorResponse, readJson } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const schema = z.object({ fullName: z.string().trim().min(1).max(120) });

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(request);
    const input = schema.parse(await readJson(request));
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('profiles')
      .update({ full_name: input.fullName })
      .eq('id', auth.user.id)
      .select('id, account_type, full_name')
      .single();
    if (error) throw error;
    return NextResponse.json({ profile: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
