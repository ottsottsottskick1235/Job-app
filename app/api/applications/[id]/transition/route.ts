import { NextResponse } from 'next/server';
import { apiErrorResponse, readJson } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { transitionApplicationForUser } from '@/lib/applicationService';
import { applicationTransitionSchema } from '@/lib/validation';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const input = applicationTransitionSchema.parse(await readJson(request));
    const application = await transitionApplicationForUser({ applicationId: id, to: input.to, reason: input.reason, auth });
    return NextResponse.json({ application });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
