const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeJobFilters, jobMatchesFilters, sortJobs } = require('../.test-build/filters.js');

const baseJob = {
  id: 'job-1', title: 'Senior Pool Lifeguard', category: 'lifeguard', employerId: 'emp-1',
  hourlyRate: 24, maxHourlyRate: 27, weeklyHours: 20, minExperienceMonths: 6,
  employmentType: 'part_time', workplaceType: 'on_site', latitude: 42.99, longitude: -81.25,
  requiredCertifications: ['NLS Pool', 'Standard First Aid'], shiftWeekdays: [1, 3, 6],
  startDate: '2026-10-01', closingDate: '2026-09-30', status: 'open', score: 88,
};

test('normalizeJobFilters trims, lowercases and deduplicates list filters', () => {
  const value = normalizeJobFilters({ q: '  Pool ', categories: ['Lifeguard', ' lifeguard '], certifications: ['NLS Pool', 'nls pool'] });
  assert.equal(value.q, 'pool');
  assert.deepEqual(value.categories, ['lifeguard']);
  assert.deepEqual(value.certifications, ['nls pool']);
});

test('jobMatchesFilters combines multiple dimensions with AND semantics', () => {
  const filters = normalizeJobFilters({
    q: 'pool', categories: ['lifeguard'], employmentTypes: ['part_time'], workplaceTypes: ['on_site'],
    minPay: 22, maxExperienceMonths: 12, certifications: ['NLS Pool'], weekdays: [6], minScore: 80,
  });
  assert.equal(jobMatchesFilters(baseJob, filters), true);
  assert.equal(jobMatchesFilters({ ...baseJob, hourlyRate: 19 }, filters), false);
  assert.equal(jobMatchesFilters({ ...baseJob, requiredCertifications: [] }, filters), false);
});

test('radius filter uses the provided origin', () => {
  const near = normalizeJobFilters({ originLat: 42.9849, originLon: -81.2453, radiusKm: 5 });
  const tiny = normalizeJobFilters({ originLat: 42.9849, originLon: -81.2453, radiusKm: 0.1 });
  assert.equal(jobMatchesFilters(baseJob, near), true);
  assert.equal(jobMatchesFilters(baseJob, tiny), false);
});

test('sortJobs supports score, pay, distance, and newest order', () => {
  const jobs = [
    { ...baseJob, id: 'a', score: 70, hourlyRate: 30, createdAt: '2026-09-15T00:00:00Z' },
    { ...baseJob, id: 'b', score: 95, hourlyRate: 20, createdAt: '2026-09-16T00:00:00Z' },
  ];
  assert.deepEqual(sortJobs(jobs, 'score_desc').map((j) => j.id), ['b', 'a']);
  assert.deepEqual(sortJobs(jobs, 'pay_desc').map((j) => j.id), ['a', 'b']);
  assert.deepEqual(sortJobs(jobs, 'newest').map((j) => j.id), ['b', 'a']);
});
