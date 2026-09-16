export type ApplicationStatus =
  | 'submitted'
  | 'employer_interested'
  | 'worker_accepted'
  | 'worker_declined'
  | 'withdrawn'
  | 'hired'
  | 'rejected';

export type ApplicationActor = 'worker' | 'employer' | 'system';

export class ApplicationTransitionError extends Error {
  code = 'INVALID_APPLICATION_TRANSITION' as const;

  constructor(
    public readonly from: ApplicationStatus,
    public readonly to: ApplicationStatus,
    public readonly actor: ApplicationActor,
  ) {
    super(`Application cannot transition from ${from} to ${to} by ${actor}.`);
    this.name = 'ApplicationTransitionError';
  }
}

const allowedTransitions: Record<ApplicationStatus, Partial<Record<ApplicationActor, ApplicationStatus[]>>> = {
  submitted: {
    employer: ['employer_interested', 'rejected'],
    worker: ['withdrawn'],
    system: [],
  },
  employer_interested: {
    employer: ['rejected'],
    worker: ['worker_accepted', 'worker_declined', 'withdrawn'],
    system: [],
  },
  worker_accepted: {
    employer: ['hired', 'rejected'],
    worker: ['withdrawn'],
    system: [],
  },
  worker_declined: {},
  withdrawn: {},
  hired: {},
  rejected: {},
};

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: ApplicationActor,
) {
  return allowedTransitions[from]?.[actor]?.includes(to) ?? false;
}

export function assertApplicationTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: ApplicationActor,
) {
  if (!canTransitionApplication(from, to, actor)) {
    throw new ApplicationTransitionError(from, to, actor);
  }
  return { from, to, actor } as const;
}
