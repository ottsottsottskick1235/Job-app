import type { JobForMatching, WorkerForMatching } from './types';

export function workerFromRows(worker: any, certifications: any[], availability: any[]): WorkerForMatching {
  return {
    id: worker.id,
    preferredRoles: worker.preferred_roles ?? [],
    preferredEmploymentTypes: worker.preferred_employment_types ?? [],
    preferredWorkplaceTypes: worker.preferred_workplace_types ?? [],
    roleKeywords: worker.role_keywords ?? [],
    minHourlyRate: Number(worker.min_hourly_rate),
    maxTravelKm: Number(worker.max_travel_km),
    minWeeklyHours: worker.min_weekly_hours,
    maxWeeklyHours: worker.max_weekly_hours,
    experienceMonths: worker.experience_months,
    latitude: worker.latitude,
    longitude: worker.longitude,
    certifications: certifications.map((row) => ({ name: row.name, expiresOn: row.expires_on })),
    availability: availability.map((row) => ({
      weekday: row.weekday,
      startTime: row.start_time,
      endTime: row.end_time,
    })),
    active: worker.active,
  };
}

export function jobFromRows(job: any, requiredCertifications: any[], shifts: any[]): JobForMatching {
  return {
    id: job.id,
    title: job.title,
    category: job.category,
    hourlyRate: Number(job.hourly_rate),
    maxHourlyRate: job.max_hourly_rate == null ? null : Number(job.max_hourly_rate),
    weeklyHours: job.weekly_hours,
    minExperienceMonths: job.min_experience_months,
    latitude: job.latitude,
    longitude: job.longitude,
    startDate: job.start_date,
    requiredCertifications: requiredCertifications.map((row) => row.name),
    shifts: shifts.map((row) => ({
      weekday: row.weekday,
      startTime: row.start_time,
      endTime: row.end_time,
    })),
    employmentType: job.employment_type,
    workplaceType: job.workplace_type,
    status: job.status,
  };
}
