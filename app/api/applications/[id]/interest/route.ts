import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { transitionApplicationForUser } from '@/lib/applicationService';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const application = await transitionApplicationForUser({ applicationId: id, to: 'employer_interested', auth });
    return NextResponse.json({ application });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
