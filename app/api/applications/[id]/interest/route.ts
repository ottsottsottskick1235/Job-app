import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('applications').update({
      status: 'employer_interested',
      employer_interest_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'submitted').select('*').single();

    if (error) throw error;
    return NextResponse.json({ application: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Could not mark interest' }, { status: 400 });
  }
}
