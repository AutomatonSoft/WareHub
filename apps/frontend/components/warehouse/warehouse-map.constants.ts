import type { WarehouseZone } from "./warehouse-map.types";

export const WAREHOUSE_MAP_VIEWBOX = "0 0 2120 800";

export const warehouseMapZones: WarehouseZone[] = [
  {
    id: "A",
    label: "A",
    name: "SHOWROOM",
    color: "#EB8594",
    shape: "path",
    path: "M 84 104 H 760 V 284 H 1036 V 445 H 84 Z",
    textX: 420,
    textY: 274
  },
  { id: "B", label: "B", color: "#9DA9DD", shape: "rect", x: 84, y: 465, width: 720, height: 88, rx: 14, textX: 444, textY: 509 },
  { id: "C", label: "C", color: "#69BED0", shape: "rect", x: 84, y: 563, width: 720, height: 50, rx: 12, textX: 444, textY: 588 },
  { id: "D", label: "D", color: "#F4C765", shape: "rect", x: 84, y: 623, width: 720, height: 73, rx: 14, textX: 444, textY: 659 },
  { id: "E", label: "E", color: "#78C8A1", shape: "rect", x: 814, y: 465, width: 222, height: 231, rx: 14, textX: 925, textY: 581 },
  { id: "F", label: "F", color: "#C9E687", shape: "rect", x: 1324, y: 104, width: 712, height: 105, rx: 14, textX: 1680, textY: 156 },
  { id: "M", label: "M", color: "#EFAFC3", shape: "rect", x: 1324, y: 219, width: 135, height: 477, rx: 14, textX: 1391, textY: 491 },
  { id: "K", label: "K", color: "#63BBCB", shape: "rect", x: 1469, y: 219, width: 115, height: 477, rx: 14, textX: 1526, textY: 491 },
  { id: "J", label: "J", color: "#F3C25F", shape: "rect", x: 1594, y: 219, width: 100, height: 300, rx: 14, textX: 1644, textY: 369 },
  { id: "I", label: "I", color: "#AA95D1", shape: "rect", x: 1704, y: 219, width: 100, height: 300, rx: 14, textX: 1754, textY: 369 },
  { id: "H", label: "H", color: "#EA808C", shape: "rect", x: 1814, y: 219, width: 100, height: 300, rx: 14, textX: 1864, textY: 369 },
  { id: "G", label: "G", color: "#65BDCE", shape: "rect", x: 1924, y: 219, width: 112, height: 300, rx: 14, textX: 1980, textY: 369 }
];
