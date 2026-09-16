import { evaluateMatch } from '../lib/matching';

const worker = {
  id: 'worker-1',
  preferredRoles: ['lifeguard'],
  minHourlyRate: 20,
  maxTravelKm: 20,
  minWeeklyHours: 8,
  maxWeeklyHours: 24,
  experienceMonths: 12,
  latitude: 42.9849,
  longitude: -81.2453,
  certifications: [
    { name: 'NLS Pool', expiresOn: '2027-12-31' },
    { name: 'Standard First Aid', expiresOn: '2027-12-31' },
  ],
  availability: [{ weekday: 6, startTime: '08:00', endTime: '18:00' }],
};

const job = {
  id: 'job-1',
  category: 'lifeguard',
  hourlyRate: 22,
  weeklyHours: 12,
  minExperienceMonths: 6,
  latitude: 42.9900,
  longitude: -81.2500,
  startDate: '2026-10-01',
  requiredCertifications: ['NLS Pool', 'Standard First Aid'],
  shifts: [{ weekday: 6, startTime: '10:00', endTime: '16:00' }],
};

console.log(evaluateMatch(worker, job));
