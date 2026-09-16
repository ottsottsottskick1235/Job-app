const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateMatch, distanceKm, MATCHER_VERSION } = require('../.test-build/matching.js');

function worker(overrides = {}) {
  return {
    id: 'worker-1',
    preferredRoles: ['lifeguard'],
    preferredEmploymentTypes: ['part_time'],
    preferredWorkplaceTypes: ['on_site'],
    minHourlyRate: 20,
    maxTravelKm: 20,
    minWeeklyHours: 8,
    maxWeeklyHours: 24,
    experienceMonths: 12,
    latitude: 42.9849,
    longitude: -81.2453,
    certifications: [{ name: 'NLS Pool', expiresOn: '2027-12-31' }],
    availability: [{ weekday: 6, startTime: '08:00', endTime: '18:00' }],
    active: true,
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    id: 'job-1',
    category: 'lifeguard',
    hourlyRate: 22,
    maxHourlyRate: 24,
    weeklyHours: 12,
    minExperienceMonths: 6,
    latitude: 42.99,
    longitude: -81.25,
    startDate: '2026-10-01',
    requiredCertifications: ['NLS Pool'],
    shifts: [{ weekday: 6, startTime: '10:00', endTime: '16:00' }],
    employmentType: 'part_time',
    workplaceType: 'on_site',
    status: 'open',
    ...overrides,
  };
}

test('distanceKm returns roughly the expected London-distance scale', () => {
  const km = distanceKm(42.9849, -81.2453, 42.99, -81.25);
  assert.ok(km > 0.5 && km < 1.0);
});

test('eligible match returns an explainable bounded score and matcher version', () => {
  const result = evaluateMatch(worker(), job());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.matcherVersion, MATCHER_VERSION);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.equal(typeof result.scoreBreakdown.distance, 'number');
  assert.equal(typeof result.scoreBreakdown.pay, 'number');
  assert.equal(typeof result.scoreBreakdown.experience, 'number');
  assert.equal(typeof result.scoreBreakdown.hours, 'number');
  assert.equal(typeof result.scoreBreakdown.schedule, 'number');
  assert.equal(typeof result.scoreBreakdown.preferences, 'number');
});

test('soft score never overrides a hard pay requirement', () => {
  const result = evaluateMatch(worker({ minHourlyRate: 30 }), job({ hourlyRate: 29 }));
  assert.equal(result.eligible, false);
  assert.equal(result.score, 0);
  assert.ok(result.reasons.some((reason) => reason.includes('below worker minimum')));
});

test('employment and workplace preferences are hard compatibility requirements when supplied', () => {
  const employment = evaluateMatch(worker(), job({ employmentType: 'full_time' }));
  assert.equal(employment.eligible, false);
  assert.ok(employment.reasons.some((reason) => reason.includes('employment type')));

  const workplace = evaluateMatch(worker(), job({ workplaceType: 'remote' }));
  assert.equal(workplace.eligible, false);
  assert.ok(workplace.reasons.some((reason) => reason.includes('workplace type')));
});

test('inactive workers and non-open jobs are ineligible', () => {
  assert.equal(evaluateMatch(worker({ active: false }), job()).eligible, false);
  assert.equal(evaluateMatch(worker(), job({ status: 'paused' })).eligible, false);
});

test('expired certifications and uncovered shifts fail hard requirements', () => {
  const expired = evaluateMatch(
    worker({ certifications: [{ name: 'NLS Pool', expiresOn: '2026-09-01' }] }),
    job(),
  );
  assert.equal(expired.eligible, false);
  assert.ok(expired.reasons.some((reason) => reason.includes('expires before')));

  const unavailable = evaluateMatch(worker({ availability: [] }), job());
  assert.equal(unavailable.eligible, false);
  assert.ok(unavailable.reasons.some((reason) => reason.includes('does not cover')));
});

test('closer and higher-paying eligible jobs score better all else equal', () => {
  const w = worker({ minHourlyRate: 18 });
  const closeHigh = evaluateMatch(w, job({ hourlyRate: 28, latitude: 42.985, longitude: -81.245 }));
  const farLow = evaluateMatch(w, job({ hourlyRate: 19, latitude: 43.10, longitude: -81.245 }));
  assert.equal(closeHigh.eligible, true);
  assert.equal(farLow.eligible, true);
  assert.ok(closeHigh.score > farLow.score);
});
