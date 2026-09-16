import type {
  JobForMatching,
  MatchResult,
  MatchScoreBreakdown,
  TimeBlock,
  WorkerForMatching,
} from './types';

export const MATCHER_VERSION = '2.0.0';

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function toMinutes(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function availabilityCovers(availability: TimeBlock[], shift: TimeBlock) {
  return availability.some((block) => {
    if (block.weekday !== shift.weekday) return false;
    return toMinutes(block.startTime) <= toMinutes(shift.startTime) &&
      toMinutes(block.endTime) >= toMinutes(shift.endTime);
  });
}

function coveringAvailability(availability: TimeBlock[], shift: TimeBlock) {
  return availability.filter((block) => {
    if (block.weekday !== shift.weekday) return false;
    return toMinutes(block.startTime) <= toMinutes(shift.startTime) &&
      toMinutes(block.endTime) >= toMinutes(shift.endTime);
  });
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function zeroBreakdown(): MatchScoreBreakdown {
  return { distance: 0, pay: 0, experience: 0, hours: 0, schedule: 0, preferences: 0 };
}

function scoreEligibleMatch(worker: WorkerForMatching, job: JobForMatching, travelDistance: number): MatchScoreBreakdown {
  const distanceWeight = 25;
  const payWeight = 20;
  const experienceWeight = 15;
  const hoursWeight = 15;
  const scheduleWeight = 10;
  const preferencesWeight = 15;

  const distanceRatio = job.workplaceType === 'remote'
    ? 1
    : 1 - clamp(travelDistance / Math.max(worker.maxTravelKm, 0.1));
  const distance = distanceWeight * distanceRatio;

  const paySurplus = Math.max(0, job.hourlyRate - worker.minHourlyRate);
  const payScale = Math.max(worker.minHourlyRate * 0.5, 5);
  const pay = payWeight * clamp(0.35 + (paySurplus / payScale) * 0.65);

  const experienceSurplus = Math.max(0, worker.experienceMonths - job.minExperienceMonths);
  const experienceScale = Math.max(job.minExperienceMonths, 12);
  const experience = experienceWeight * clamp(0.5 + (experienceSurplus / experienceScale) * 0.5);

  let hours = hoursWeight * 0.7;
  if (job.weeklyHours != null && worker.minWeeklyHours != null && worker.maxWeeklyHours != null) {
    const min = worker.minWeeklyHours;
    const max = worker.maxWeeklyHours;
    const midpoint = (min + max) / 2;
    const halfRange = Math.max((max - min) / 2, 1);
    hours = hoursWeight * clamp(1 - Math.abs(job.weeklyHours - midpoint) / (halfRange * 1.5));
  } else if (job.weeklyHours != null && (worker.minWeeklyHours != null || worker.maxWeeklyHours != null)) {
    hours = hoursWeight * 0.85;
  }

  let scheduleRatio = 1;
  if (job.shifts.length) {
    const ratios = job.shifts.map((shift) => {
      const matches = coveringAvailability(worker.availability, shift);
      if (!matches.length) return 0;
      const shiftMinutes = Math.max(toMinutes(shift.endTime) - toMinutes(shift.startTime), 1);
      const bestSlack = Math.max(...matches.map((block) => {
        const before = toMinutes(shift.startTime) - toMinutes(block.startTime);
        const after = toMinutes(block.endTime) - toMinutes(shift.endTime);
        return before + after;
      }));
      return clamp(0.65 + (bestSlack / shiftMinutes) * 0.35);
    });
    scheduleRatio = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
  }
  const schedule = scheduleWeight * scheduleRatio;

  let preferenceSignals = 1;
  let preferenceHits = 1;
  if (job.employmentType && worker.preferredEmploymentTypes?.length) {
    preferenceSignals += 1;
    if (worker.preferredEmploymentTypes.includes(job.employmentType)) preferenceHits += 1;
  }
  if (job.workplaceType && worker.preferredWorkplaceTypes?.length) {
    preferenceSignals += 1;
    if (worker.preferredWorkplaceTypes.includes(job.workplaceType)) preferenceHits += 1;
  }
  if (worker.roleKeywords?.length && job.title) {
    preferenceSignals += 1;
    const haystack = normalize(`${job.title} ${job.category}`);
    if (worker.roleKeywords.some((keyword) => haystack.includes(normalize(keyword)))) preferenceHits += 1;
  }
  const preferences = preferencesWeight * (preferenceHits / preferenceSignals);

  return {
    distance: roundScore(distance),
    pay: roundScore(pay),
    experience: roundScore(experience),
    hours: roundScore(hours),
    schedule: roundScore(schedule),
    preferences: roundScore(preferences),
  };
}

export function evaluateMatch(worker: WorkerForMatching, job: JobForMatching): MatchResult {
  const reasons: string[] = [];

  if (worker.active === false) reasons.push('Worker profile is inactive.');
  if (job.status && job.status !== 'open') reasons.push(`Job status is ${job.status}, not open.`);

  const workerRoles = worker.preferredRoles.map(normalize);
  if (!workerRoles.includes(normalize(job.category))) {
    reasons.push(`Job category "${job.category}" is not in the worker's preferred roles.`);
  }

  if (job.employmentType && worker.preferredEmploymentTypes?.length &&
      !worker.preferredEmploymentTypes.includes(job.employmentType)) {
    reasons.push(`Job employment type "${job.employmentType}" is not in the worker's preferences.`);
  }

  if (job.workplaceType && worker.preferredWorkplaceTypes?.length &&
      !worker.preferredWorkplaceTypes.includes(job.workplaceType)) {
    reasons.push(`Job workplace type "${job.workplaceType}" is not in the worker's preferences.`);
  }

  if (job.hourlyRate < worker.minHourlyRate) {
    reasons.push(`Job pays ${job.hourlyRate}, below worker minimum ${worker.minHourlyRate}.`);
  }

  if (worker.experienceMonths < job.minExperienceMonths) {
    reasons.push(`Worker has ${worker.experienceMonths} months of experience; job requires ${job.minExperienceMonths}.`);
  }

  const travelDistance = distanceKm(worker.latitude, worker.longitude, job.latitude, job.longitude);
  if (job.workplaceType !== 'remote' && travelDistance > worker.maxTravelKm) {
    reasons.push(`Job is ${travelDistance.toFixed(1)} km away; worker maximum is ${worker.maxTravelKm} km.`);
  }

  if (job.weeklyHours != null && worker.minWeeklyHours != null && job.weeklyHours < worker.minWeeklyHours) {
    reasons.push(`Job offers ${job.weeklyHours} weekly hours; worker minimum is ${worker.minWeeklyHours}.`);
  }

  if (job.weeklyHours != null && worker.maxWeeklyHours != null && job.weeklyHours > worker.maxWeeklyHours) {
    reasons.push(`Job offers ${job.weeklyHours} weekly hours; worker maximum is ${worker.maxWeeklyHours}.`);
  }

  const certMap = new Map(worker.certifications.map((cert) => [normalize(cert.name), cert]));
  for (const required of job.requiredCertifications) {
    const cert = certMap.get(normalize(required));
    if (!cert) {
      reasons.push(`Missing required certification: ${required}.`);
      continue;
    }

    if (cert.expiresOn && job.startDate) {
      const expiry = new Date(`${cert.expiresOn}T23:59:59Z`).getTime();
      const start = new Date(`${job.startDate}T00:00:00Z`).getTime();
      if (expiry < start) reasons.push(`${required} expires before the job start date.`);
    }
  }

  for (const shift of job.shifts) {
    if (!availabilityCovers(worker.availability, shift)) {
      reasons.push(`Worker availability does not cover weekday ${shift.weekday} from ${shift.startTime} to ${shift.endTime}.`);
    }
  }

  if (reasons.length) {
    return {
      eligible: false,
      reasons,
      score: 0,
      scoreBreakdown: zeroBreakdown(),
      matcherVersion: MATCHER_VERSION,
    };
  }

  const scoreBreakdown = scoreEligibleMatch(worker, job, travelDistance);
  const score = roundScore(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0));
  return { eligible: true, reasons: [], score, scoreBreakdown, matcherVersion: MATCHER_VERSION };
}
