import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const schema = z.object({
  companyName: z.string().min(1),
  email: z.string().email(),
  latitude: z.number(),
  longitude: z.number(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('employers').insert({
      company_name: input.companyName,
      email: input.email,
      latitude: input.latitude,
      longitude: input.longitude,
    }).select('*').single();

    if (error) throw error;
    return NextResponse.json({ employer: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Invalid request' }, { status: 400 });
  }
}
