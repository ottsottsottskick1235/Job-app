import { NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, parseLimit, parseOffset } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { getWorkerForUser } from '@/lib/authorization';
import { normalizeJobFilters, jobMatchesFilters, sortJobs, type JobSort, type FilterableJob } from '@/lib/filters';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { EmploymentType, WorkplaceType } from '@/lib/types';

const EMPLOYMENT_TYPES = new Set<EmploymentType>(['full_time','part_time','contract','temporary','seasonal','casual','internship']);
const WORKPLACE_TYPES = new Set<WorkplaceType>(['on_site','hybrid','remote']);
const SORTS = new Set<JobSort>(['score_desc','pay_desc','pay_asc','distance_asc','newest','start_date']);

function listParam(params: URLSearchParams, name: string) {
  return params.getAll(name).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

function numberParam(params: URLSearchParams, name: string) {
  const raw = params.get(name);
  if (raw == null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ApiError(400, 'INVALID_FILTER', `${name} must be a number.`);
  return value;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url = new URL(request.url);
    const params = url.searchParams;
    const limit = parseLimit(params.get('limit'), 25, 100);
    const offset = parseOffset(params.get('offset'));
    const sort = (params.get('sort') ?? 'newest') as JobSort;
    if (!SORTS.has(sort)) throw new ApiError(400, 'INVALID_SORT', 'Unsupported job sort.');

    const employmentTypes = listParam(params, 'employmentType') as EmploymentType[];
    const workplaceTypes = listParam(params, 'workplaceType') as WorkplaceType[];
    if (employmentTypes.some((value) => !EMPLOYMENT_TYPES.has(value))) throw new ApiError(400, 'INVALID_FILTER', 'Invalid employmentType.');
    if (workplaceTypes.some((value) => !WORKPLACE_TYPES.has(value))) throw new ApiError(400, 'INVALID_FILTER', 'Invalid workplaceType.');

    const db = getSupabaseAdmin();
    const worker = auth.profile.account_type === 'worker' ? await getWorkerForUser(auth.user.id) : null;
    let originLat = numberParam(params, 'originLat');
    let originLon = numberParam(params, 'originLon');
    if (originLat == null && originLon == null && worker) {
      originLat = worker.latitude;
      originLon = worker.longitude;
    }
    if ((originLat == null) !== (originLon == null)) throw new ApiError(400, 'INVALID_FILTER', 'originLat and originLon must be provided together.');

    const filters = normalizeJobFilters({
      q: params.get('q'),
      categories: listParam(params, 'category'),
      employerIds: listParam(params, 'employerId'),
      employmentTypes,
      workplaceTypes,
      statuses: ['open'],
      minPay: numberParam(params, 'minPay'),
      maxPay: numberParam(params, 'maxPay'),
      minWeeklyHours: numberParam(params, 'minWeeklyHours'),
      maxWeeklyHours: numberParam(params, 'maxWeeklyHours'),
      maxExperienceMonths: numberParam(params, 'maxExperienceMonths'),
      certifications: listParam(params, 'certification'),
      weekdays: listParam(params, 'weekday').map(Number),
      startsOnOrAfter: params.get('startsOnOrAfter'),
      startsOnOrBefore: params.get('startsOnOrBefore'),
      closesOnOrAfter: params.get('closesOnOrAfter'),
      originLat,
      originLon,
      radiusKm: numberParam(params, 'radiusKm'),
      minScore: numberParam(params, 'minScore'),
      maxScore: numberParam(params, 'maxScore'),
    });

    const { data: jobs, error } = await db.from('jobs')
      .select('*, employers(id,company_name), employer_locations(id,name,city,region,country,display_name), job_required_certifications(name), job_shifts(weekday,start_time,end_time)')
      .eq('status', 'open')
      .or(`closing_date.is.null,closing_date.gte.${new Date().toISOString().slice(0, 10)}`)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;

    let scoreByJob = new Map<string, number>();
    let applicationByJob = new Map<string, { id: string; status: string; match_score: number | null }>();
    if (worker) {
      const { data: applications, error: applicationsError } = await db.from('applications')
        .select('id, job_id, status, match_score')
        .eq('worker_id', worker.id);
      if (applicationsError) throw applicationsError;
      scoreByJob = new Map<string, number>((applications ?? []).filter((item: any) => item.match_score != null).map((item: any) => [item.job_id, Number(item.match_score)]));
      applicationByJob = new Map<string, { id: string; status: string; match_score: number | null }>((applications ?? []).map((item: any) => [item.job_id, item]));
    }

    const eligibleOnly = params.get('eligibleOnly') === 'true';
    const shaped = (jobs ?? []).map((job: any) => {
      const score = scoreByJob.get(job.id) ?? null;
      const filterable: FilterableJob = {
        id: job.id,
        title: job.title,
        category: job.category,
        employerId: job.employer_id,
        hourlyRate: Number(job.hourly_rate),
        maxHourlyRate: job.max_hourly_rate == null ? null : Number(job.max_hourly_rate),
        weeklyHours: job.weekly_hours,
        minExperienceMonths: job.min_experience_months,
        employmentType: job.employment_type,
        workplaceType: job.workplace_type,
        latitude: job.latitude,
        longitude: job.longitude,
        requiredCertifications: (job.job_required_certifications ?? []).map((item: any) => item.name),
        shiftWeekdays: (job.job_shifts ?? []).map((item: any) => item.weekday),
        startDate: job.start_date,
        closingDate: job.closing_date,
        status: job.status,
        score,
        createdAt: job.created_at,
      };
      return { raw: job, filterable, application: applicationByJob.get(job.id) ?? null };
    }).filter((item) => !eligibleOnly || item.application);

    const matching = shaped.filter((item) => jobMatchesFilters(item.filterable, filters));
    const ordered = sortJobs(matching.map((item) => item.filterable), sort, filters);
    const byId = new Map<string, (typeof shaped)[number]>(shaped.map((item) => [item.filterable.id, item]));
    const page = ordered.slice(offset, offset + limit).map((filterable) => {
      const item = byId.get(filterable.id)!;
      return {
        ...item.raw,
        matchScore: filterable.score,
        application: item.application,
      };
    });

    return NextResponse.json({
      jobs: page,
      pagination: { limit, offset, total: ordered.length, hasMore: offset + limit < ordered.length },
      filters,
      sort,
      sourceTruncated: (jobs ?? []).length === 1000,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
