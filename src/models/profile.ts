import type { AuditFields, EntityId, IsoDate } from './common';

export type UserRole = 'participant' | 'coach' | 'admin';
export type SubscriptionStatus = 'pending' | 'active' | 'suspended' | 'cancelled';
export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';
export type TrainingModality = 'gym' | 'home';

export interface UserProfile extends AuditFields {
  id: EntityId;
  firstName: string;
  lastName: string;
  preferredName?: string;
  email: string;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  birthDate?: IsoDate;
  avatarUrl?: string;
  objective?: string;
  personalGoal?: string;
  weeklyGoal?: number;
  level?: TrainingLevel;
  modality?: TrainingModality;
  mealPlanId?: string;
  calorieGoal?: number;
  mealTimes: Record<string, string>;
  notificationPreferences: {
    workouts: boolean;
    meetings: boolean;
    rewards: boolean;
  };
  shareProgressWithTeam: boolean;
  onboardingCompleted: boolean;
  active: boolean;
  legacyImportedAt?: string;
}

export function getUserFullName(profile: Pick<UserProfile, 'firstName' | 'lastName'>): string {
  return `${profile.firstName} ${profile.lastName}`.trim();
}
