import type { EntityId, IsoDateTime, MediaAsset } from './common';

export type ContentType = 'article' | 'video' | 'audio' | 'quiz' | 'download';

export interface ProgramContent {
  id: EntityId;
  title: string;
  description?: string;
  type: ContentType;
  media?: MediaAsset;
  publishedAt?: IsoDateTime;
}

export interface ProgramMeeting {
  id: EntityId;
  title: string;
  startsAt: IsoDateTime;
  meetingUrl?: string;
  description?: string;
}

export interface Reward {
  id: EntityId;
  title: string;
  description?: string;
  pointsRequired?: number;
  available: boolean;
}
