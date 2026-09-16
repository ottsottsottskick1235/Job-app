import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('applications').select(`
      *,
      workers(full_name, email),
      jobs(title, category, hourly_rate, employer_id)
    `).order('matched_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ applications: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Could not load applications' }, { status: 500 });
  }
}
