import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'job-app', version: '0.2.0', time: new Date().toISOString() });
}
