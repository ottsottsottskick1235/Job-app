import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const schema = z.object({ decision: z.enum(['accept', 'decline']) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('applications').update({
      status: input.decision === 'accept' ? 'worker_accepted' : 'worker_declined',
      worker_decision_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'employer_interested').select('*').single();

    if (error) throw error;
    return NextResponse.json({ application: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Could not save decision' }, { status: 400 });
  }
}
