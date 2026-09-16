export type TimeBlock = {
  weekday: number;
  startTime: string;
  endTime: string;
};

export type Certification = {
  name: string;
  expiresOn?: string | null;
};

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary' | 'seasonal' | 'casual' | 'internship';
export type WorkplaceType = 'on_site' | 'hybrid' | 'remote';
export type JobStatus = 'open' | 'paused' | 'closed';

export type WorkerForMatching = {
  id: string;
  preferredRoles: string[];
  preferredEmploymentTypes?: EmploymentType[];
  preferredWorkplaceTypes?: WorkplaceType[];
  roleKeywords?: string[];
  minHourlyRate: number;
  maxTravelKm: number;
  minWeeklyHours?: number | null;
  maxWeeklyHours?: number | null;
  experienceMonths: number;
  latitude: number;
  longitude: number;
  certifications: Certification[];
  availability: TimeBlock[];
  active?: boolean;
};

export type JobForMatching = {
  id: string;
  title?: string;
  category: string;
  hourlyRate: number;
  maxHourlyRate?: number | null;
  weeklyHours?: number | null;
  minExperienceMonths: number;
  latitude: number;
  longitude: number;
  startDate?: string | null;
  requiredCertifications: string[];
  shifts: TimeBlock[];
  employmentType?: EmploymentType | null;
  workplaceType?: WorkplaceType | null;
  status?: JobStatus;
};

export type MatchScoreBreakdown = {
  distance: number;
  pay: number;
  experience: number;
  hours: number;
  schedule: number;
  preferences: number;
};

export type MatchResult = {
  eligible: boolean;
  reasons: string[];
  score: number;
  scoreBreakdown: MatchScoreBreakdown;
  matcherVersion: string;
};
