import type { EntityId, IsoDate, MediaAsset } from './common';

export type MealType = 'breakfast' | 'morning_snack' | 'lunch' | 'afternoon_snack' | 'dinner' | 'supper' | 'other';

export interface FoodItem {
  id: EntityId;
  name: string;
  portion: string;
  calories?: number;
}

export interface MealOption {
  id: EntityId;
  name: string;
  type: MealType;
  items: FoodItem[];
  totalCalories?: number;
}

export interface FoodDiaryEntry {
  id: EntityId;
  userId: EntityId;
  date: IsoDate;
  type: MealType;
  optionId?: EntityId;
  description?: string;
  calories?: number;
  photos: MediaAsset[];
}
