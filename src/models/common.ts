export type EntityId = string;
export type IsoDate = string;
export type IsoDateTime = string;

export interface AuditFields {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface MediaAsset {
  id: EntityId;
  uri: string;
  mimeType?: string;
  width?: number;
  height?: number;
}
