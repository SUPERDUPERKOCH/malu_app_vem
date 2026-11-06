import type { EntityId, IsoDate, IsoDateTime } from './common';

export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

export interface Exercise {
  id: EntityId;
  name: string;
  instructions?: string;
  videoUrl?: string;
  muscleGroup?: string;
}

export interface WorkoutSet {
  id: EntityId;
  repetitions?: number;
  durationSeconds?: number;
  loadKg?: number;
  completed: boolean;
}

export interface WorkoutExercise {
  exercise: Exercise;
  order: number;
  restSeconds: number;
  sets: WorkoutSet[];
}

export interface WorkoutPlan {
  id: EntityId;
  title: string;
  description?: string;
  exercises: WorkoutExercise[];
  active: boolean;
}

export interface WorkoutSession {
  id: EntityId;
  planId: EntityId;
  userId: EntityId;
  scheduledDate: IsoDate;
  startedAt?: IsoDateTime;
  finishedAt?: IsoDateTime;
  status: WorkoutStatus;
  exercises: WorkoutExercise[];
  notes?: string;
}

export interface RunRecord {
  id: EntityId;
  userId: EntityId;
  date: IsoDate;
  distanceKm: number;
  durationSeconds: number;
  perceivedEffort?: number;
  painLevel?: number;
  notes?: string;
}
