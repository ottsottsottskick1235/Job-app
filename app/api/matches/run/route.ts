import { NextResponse } from 'next/server';
import { runMatching } from '@/lib/runMatching';

export async function POST() {
  try {
    return NextResponse.json(await runMatching());
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Matching failed' }, { status: 500 });
  }
}
