import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, 'Expected HH:MM time.');
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const accountTypeSchema = z.enum(['worker', 'employer']);
export const employerRoleSchema = z.enum(['owner', 'admin', 'recruiter', 'viewer']);
export const employmentTypeSchema = z.enum(['full_time', 'part_time', 'contract', 'temporary', 'seasonal', 'casual', 'internship']);
export const workplaceTypeSchema = z.enum(['on_site', 'hybrid', 'remote']);
export const applicationStatusSchema = z.enum(['submitted', 'employer_interested', 'worker_accepted', 'worker_declined', 'withdrawn', 'hired', 'rejected']);

export const signupSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  accountType: accountTypeSchema,
  fullName: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export const timeBlockSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: time,
  endTime: time,
}).superRefine((value, ctx) => {
  if (value.endTime <= value.startTime) ctx.addIssue({ code: 'custom', message: 'endTime must be after startTime' });
});

export const certificationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  expiresOn: isoDate.nullable().optional(),
});

export const locationInputSchema = z.object({
  name: z.string().trim().min(1).max(120).default('Primary'),
  addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(32).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  latitude,
  longitude,
  displayName: z.string().trim().max(500).nullable().optional(),
  geocodeProvider: z.string().trim().max(80).nullable().optional(),
  geocodePlaceId: z.string().trim().max(200).nullable().optional(),
});

export const workerProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  preferredRoles: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
  preferredEmploymentTypes: z.array(employmentTypeSchema).default([]),
  preferredWorkplaceTypes: z.array(workplaceTypeSchema).default([]),
  roleKeywords: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  minHourlyRate: z.number().min(0).max(10000),
  maxTravelKm: z.number().positive().max(10000),
  minWeeklyHours: z.number().int().min(0).max(168).nullable().optional(),
  maxWeeklyHours: z.number().int().min(0).max(168).nullable().optional(),
  experienceMonths: z.number().int().min(0).max(1200),
  certifications: z.array(certificationSchema).max(100).default([]),
  availability: z.array(timeBlockSchema).min(1).max(100),
  primaryLocation: locationInputSchema,
}).superRefine((value, ctx) => {
  if (value.minWeeklyHours != null && value.maxWeeklyHours != null && value.minWeeklyHours > value.maxWeeklyHours) {
    ctx.addIssue({ code: 'custom', path: ['maxWeeklyHours'], message: 'maxWeeklyHours must be greater than or equal to minWeeklyHours' });
  }
});

export const employerCreateSchema = z.object({
  companyName: z.string().trim().min(1).max(180),
  primaryLocation: locationInputSchema.optional(),
});

export const employerLocationSchema = locationInputSchema.extend({
  isDefault: z.boolean().default(false),
});

export const jobCreateSchema = z.object({
  employerId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(20000).nullable().optional(),
  category: z.string().trim().min(1).max(120),
  hourlyRate: z.number().min(0).max(10000),
  maxHourlyRate: z.number().min(0).max(10000).nullable().optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('CAD'),
  weeklyHours: z.number().int().min(0).max(168).nullable().optional(),
  minExperienceMonths: z.number().int().min(0).max(1200).default(0),
  employmentType: employmentTypeSchema.nullable().optional(),
  workplaceType: workplaceTypeSchema.nullable().optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  closingDate: isoDate.nullable().optional(),
  openings: z.number().int().min(1).max(10000).default(1),
  requiredCertifications: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  shifts: z.array(timeBlockSchema).min(1).max(100),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).superRefine((value, ctx) => {
  if (value.maxHourlyRate != null && value.maxHourlyRate < value.hourlyRate) {
    ctx.addIssue({ code: 'custom', path: ['maxHourlyRate'], message: 'maxHourlyRate must be at least hourlyRate' });
  }
  if (!value.locationId && (value.latitude == null || value.longitude == null)) {
    ctx.addIssue({ code: 'custom', path: ['locationId'], message: 'Provide locationId or latitude/longitude.' });
  }
  if (value.endDate && value.startDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate cannot be before startDate' });
  }
});

export const applicationTransitionSchema = z.object({
  to: applicationStatusSchema,
  reason: z.string().trim().max(1000).nullable().optional(),
});

export const geocodeRequestSchema = z.object({
  query: z.string().trim().min(3).max(500),
});

export const savedSearchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  searchType: z.enum(['jobs', 'candidates', 'applications']),
  filters: z.record(z.string(), z.unknown()).default({}),
  sort: z.string().trim().max(80).nullable().optional(),
});
