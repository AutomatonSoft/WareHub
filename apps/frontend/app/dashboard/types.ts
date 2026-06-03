import type { IntakeDto } from "../client-api";

export type IntakeWsEvent = {
  kind: "intake_created" | "intake_updated" | "intake_deleted" | string;
  intake?: IntakeDto;
  intake_id?: string;
};

export type IntakeGroup = {
  key: string;
  representative: IntakeDto;
  partsTotal: number;
  partIds: string[];
  unitKeys: string[];
  count: number;
};
