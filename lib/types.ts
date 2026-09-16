export type TimeBlock = {
  weekday: number;
  startTime: string;
  endTime: string;
};

export type Certification = {
  name: string;
  expiresOn?: string | null;
};

export type WorkerForMatching = {
  id: string;
  preferredRoles: string[];
  minHourlyRate: number;
  maxTravelKm: number;
  minWeeklyHours?: number | null;
  maxWeeklyHours?: number | null;
  experienceMonths: number;
  latitude: number;
  longitude: number;
  certifications: Certification[];
  availability: TimeBlock[];
};

export type JobForMatching = {
  id: string;
  category: string;
  hourlyRate: number;
  weeklyHours?: number | null;
  minExperienceMonths: number;
  latitude: number;
  longitude: number;
  startDate?: string | null;
  requiredCertifications: string[];
  shifts: TimeBlock[];
};

export type MatchResult = {
  eligible: boolean;
  reasons: string[];
};
