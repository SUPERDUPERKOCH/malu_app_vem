import type { EntityId, IsoDateTime } from './common';

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Reminder {
  id: EntityId;
  userId?: EntityId;
  title: string;
  body?: string;
  time?: string;
  weekdays?: Weekday[];
  scheduledAt?: IsoDateTime;
  enabled: boolean;
}
