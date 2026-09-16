import type { JobForMatching, MatchResult, TimeBlock, WorkerForMatching } from './types';

function normalize(value: string) {
  return value.trim().toLowerCase();
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

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function evaluateMatch(worker: WorkerForMatching, job: JobForMatching): MatchResult {
  const reasons: string[] = [];

  const workerRoles = worker.preferredRoles.map(normalize);
  if (!workerRoles.includes(normalize(job.category))) {
    reasons.push(`Job category "${job.category}" is not in the worker's preferred roles.`);
  }

  if (job.hourlyRate < worker.minHourlyRate) {
    reasons.push(`Job pays ${job.hourlyRate}, below worker minimum ${worker.minHourlyRate}.`);
  }

  if (worker.experienceMonths < job.minExperienceMonths) {
    reasons.push(`Worker has ${worker.experienceMonths} months of experience; job requires ${job.minExperienceMonths}.`);
  }

  const travelDistance = distanceKm(worker.latitude, worker.longitude, job.latitude, job.longitude);
  if (travelDistance > worker.maxTravelKm) {
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
      if (expiry < start) {
        reasons.push(`${required} expires before the job start date.`);
      }
    }
  }

  for (const shift of job.shifts) {
    if (!availabilityCovers(worker.availability, shift)) {
      reasons.push(`Worker availability does not cover weekday ${shift.weekday} from ${shift.startTime} to ${shift.endTime}.`);
    }
  }

  return { eligible: reasons.length === 0, reasons };
}
