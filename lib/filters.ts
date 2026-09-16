import { distanceKm } from './matching';
import type { EmploymentType, JobStatus, WorkplaceType } from './types';

export type JobSort = 'score_desc' | 'pay_desc' | 'pay_asc' | 'distance_asc' | 'newest' | 'start_date';

export type JobFilterInput = {
  q?: string | null;
  categories?: string[];
  employerIds?: string[];
  employmentTypes?: EmploymentType[];
  workplaceTypes?: WorkplaceType[];
  statuses?: JobStatus[];
  minPay?: number | null;
  maxPay?: number | null;
  minWeeklyHours?: number | null;
  maxWeeklyHours?: number | null;
  maxExperienceMonths?: number | null;
  certifications?: string[];
  weekdays?: number[];
  startsOnOrAfter?: string | null;
  startsOnOrBefore?: string | null;
  closesOnOrAfter?: string | null;
  originLat?: number | null;
  originLon?: number | null;
  radiusKm?: number | null;
  minScore?: number | null;
  maxScore?: number | null;
};

export type NormalizedJobFilters = Omit<JobFilterInput,
  'q' | 'categories' | 'certifications' | 'employerIds'
> & {
  q?: string;
  categories: string[];
  certifications: string[];
  employerIds: string[];
};

export type FilterableJob = {
  id: string;
  title: string;
  category: string;
  employerId?: string | null;
  hourlyRate: number;
  maxHourlyRate?: number | null;
  weeklyHours?: number | null;
  minExperienceMonths: number;
  employmentType?: EmploymentType | null;
  workplaceType?: WorkplaceType | null;
  latitude: number;
  longitude: number;
  requiredCertifications?: string[];
  shiftWeekdays?: number[];
  startDate?: string | null;
  closingDate?: string | null;
  status?: JobStatus;
  score?: number | null;
  createdAt?: string | null;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeList(values: string[] | undefined) {
  return [...new Set((values ?? []).map(normalizeText).filter(Boolean))];
}

export function normalizeJobFilters(input: JobFilterInput): NormalizedJobFilters {
  const q = input.q ? normalizeText(input.q) : undefined;
  return {
    ...input,
    q: q || undefined,
    categories: normalizeList(input.categories),
    certifications: normalizeList(input.certifications),
    employerIds: [...new Set((input.employerIds ?? []).map((value) => value.trim()).filter(Boolean))],
    employmentTypes: [...new Set(input.employmentTypes ?? [])],
    workplaceTypes: [...new Set(input.workplaceTypes ?? [])],
    statuses: [...new Set(input.statuses ?? [])],
    weekdays: [...new Set((input.weekdays ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))],
  };
}

function includesAll(haystack: string[] | undefined, needles: string[]) {
  if (!needles.length) return true;
  const normalized = new Set((haystack ?? []).map(normalizeText));
  return needles.every((needle) => normalized.has(needle));
}

function dateAtOrAfter(value: string | null | undefined, floor: string | null | undefined) {
  if (!floor) return true;
  if (!value) return false;
  return value >= floor;
}

function dateAtOrBefore(value: string | null | undefined, ceiling: string | null | undefined) {
  if (!ceiling) return true;
  if (!value) return false;
  return value <= ceiling;
}

export function jobMatchesFilters(job: FilterableJob, filters: NormalizedJobFilters) {
  if (filters.q) {
    const haystack = normalizeText(`${job.title} ${job.category}`);
    if (!haystack.includes(filters.q)) return false;
  }

  if (filters.categories.length && !filters.categories.includes(normalizeText(job.category))) return false;
  if (filters.employerIds.length && (!job.employerId || !filters.employerIds.includes(job.employerId))) return false;
  if (filters.employmentTypes?.length && (!job.employmentType || !filters.employmentTypes.includes(job.employmentType))) return false;
  if (filters.workplaceTypes?.length && (!job.workplaceType || !filters.workplaceTypes.includes(job.workplaceType))) return false;
  if (filters.statuses?.length && (!job.status || !filters.statuses.includes(job.status))) return false;

  if (filters.minPay != null && job.hourlyRate < filters.minPay) return false;
  if (filters.maxPay != null && job.hourlyRate > filters.maxPay) return false;
  if (filters.minWeeklyHours != null && (job.weeklyHours == null || job.weeklyHours < filters.minWeeklyHours)) return false;
  if (filters.maxWeeklyHours != null && (job.weeklyHours == null || job.weeklyHours > filters.maxWeeklyHours)) return false;
  if (filters.maxExperienceMonths != null && job.minExperienceMonths > filters.maxExperienceMonths) return false;
  if (filters.minScore != null && (job.score == null || job.score < filters.minScore)) return false;
  if (filters.maxScore != null && (job.score == null || job.score > filters.maxScore)) return false;

  if (!includesAll(job.requiredCertifications, filters.certifications)) return false;
  if (filters.weekdays?.length) {
    const days = new Set(job.shiftWeekdays ?? []);
    if (!filters.weekdays.every((day) => days.has(day))) return false;
  }

  if (!dateAtOrAfter(job.startDate, filters.startsOnOrAfter)) return false;
  if (!dateAtOrBefore(job.startDate, filters.startsOnOrBefore)) return false;
  if (!dateAtOrAfter(job.closingDate, filters.closesOnOrAfter)) return false;

  if (filters.radiusKm != null && filters.originLat != null && filters.originLon != null) {
    if (distanceKm(filters.originLat, filters.originLon, job.latitude, job.longitude) > filters.radiusKm) return false;
  }

  return true;
}

function distanceForSort(job: FilterableJob, filters?: NormalizedJobFilters) {
  if (filters?.originLat == null || filters.originLon == null) return Number.POSITIVE_INFINITY;
  return distanceKm(filters.originLat, filters.originLon, job.latitude, job.longitude);
}

export function sortJobs(jobs: FilterableJob[], sort: JobSort, filters?: NormalizedJobFilters) {
  return [...jobs].sort((a, b) => {
    if (sort === 'score_desc') return (b.score ?? -1) - (a.score ?? -1);
    if (sort === 'pay_desc') return b.hourlyRate - a.hourlyRate;
    if (sort === 'pay_asc') return a.hourlyRate - b.hourlyRate;
    if (sort === 'distance_asc') return distanceForSort(a, filters) - distanceForSort(b, filters);
    if (sort === 'start_date') return (a.startDate ?? '9999-12-31').localeCompare(b.startDate ?? '9999-12-31');
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });
}
