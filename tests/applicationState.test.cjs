const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canTransitionApplication,
  assertApplicationTransition,
} = require('../.test-build/applicationState.js');

test('employer can express interest in a submitted application', () => {
  assert.equal(canTransitionApplication('submitted', 'employer_interested', 'employer'), true);
});

test('worker can withdraw submitted or interested applications', () => {
  assert.equal(canTransitionApplication('submitted', 'withdrawn', 'worker'), true);
  assert.equal(canTransitionApplication('employer_interested', 'withdrawn', 'worker'), true);
});

test('worker alone decides accept or decline after employer interest', () => {
  assert.equal(canTransitionApplication('employer_interested', 'worker_accepted', 'worker'), true);
  assert.equal(canTransitionApplication('employer_interested', 'worker_declined', 'worker'), true);
  assert.equal(canTransitionApplication('employer_interested', 'worker_accepted', 'employer'), false);
});

test('employer can hire or reject after worker acceptance', () => {
  assert.equal(canTransitionApplication('worker_accepted', 'hired', 'employer'), true);
  assert.equal(canTransitionApplication('worker_accepted', 'rejected', 'employer'), true);
});

test('terminal statuses cannot transition', () => {
  for (const status of ['worker_declined', 'withdrawn', 'hired', 'rejected']) {
    assert.equal(canTransitionApplication(status, 'submitted', 'system'), false);
  }
});

test('assertApplicationTransition throws a stable error for an invalid transition', () => {
  assert.throws(
    () => assertApplicationTransition('submitted', 'hired', 'employer'),
    (error) => error && error.code === 'INVALID_APPLICATION_TRANSITION',
  );
});
