import type { EntityId, IsoDate, MediaAsset } from './common';

export interface BodyMeasurements {
  weightKg?: number;
  waistCm?: number;
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
}

export interface ProgressCheckIn {
  id: EntityId;
  userId: EntityId;
  date: IsoDate;
  measurements: BodyMeasurements;
  energyLevel?: number;
  moodLevel?: number;
  notes?: string;
  photos: MediaAsset[];
}

export interface ProgressMilestone {
  id: EntityId;
  userId: EntityId;
  date: IsoDate;
  title: string;
  description?: string;
}
