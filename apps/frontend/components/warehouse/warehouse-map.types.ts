export type WarehouseZone = {
  id: string;
  label: string;
  name?: string;
  color: string;
  shape: "rect" | "path";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rx?: number;
  path?: string;
  textX: number;
  textY: number;
};
