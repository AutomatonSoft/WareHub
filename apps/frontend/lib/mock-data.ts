export type KpiMetricId =
  | "total_products"
  | "stock_value"
  | "low_stock_items"
  | "avg_fulfillment_rate"
  | "in_transit_products"
  | "b_ware_products";

export type KpiMetric = {
  id: KpiMetricId;
  value: string;
  delta: string;
  trend: "up" | "down";
};

export const kpiMetrics: KpiMetric[] = [
  { id: "total_products", value: "12,847", delta: "+8.4%", trend: "up" },
  { id: "stock_value", value: "$3.84M", delta: "+5.1%", trend: "up" },
  { id: "low_stock_items", value: "47", delta: "-6 today", trend: "down" },
  { id: "avg_fulfillment_rate", value: "98.7%", delta: "+1.3%", trend: "up" }
];

export const trendSeries = [
  { month: "Jan", revenue: 42, stock: 31, sync: 28 },
  { month: "Feb", revenue: 55, stock: 38, sync: 36 },
  { month: "Mar", revenue: 68, stock: 44, sync: 48 },
  { month: "Apr", revenue: 58, stock: 41, sync: 43 },
  { month: "May", revenue: 74, stock: 52, sync: 56 },
  { month: "Jun", revenue: 88, stock: 66, sync: 63 },
  { month: "Jul", revenue: 79, stock: 59, sync: 58 },
  { month: "Aug", revenue: 94, stock: 68, sync: 72 }
];

export const lowStockAlerts = [
  { id: "AL-188", name: "Dyson V15 Filter", sku: "WH-DY-113", qty: 6 },
  { id: "AL-201", name: "Kitchen Mixer Core", sku: "WH-KI-020", qty: 9 },
  { id: "AL-245", name: "Samsung Curved Panel", sku: "WH-SA-982", qty: 4 },
  { id: "AL-277", name: "Logitech MX Dock", sku: "WH-LO-777", qty: 8 }
];

export const timelineItems = [
  "OTTO sync completed for 1,284 SKUs",
  "Stock transfer created: Aisle B2 to C4",
  "Amazon listing prices revalidated",
  "New user invited to Workspace North",
  "EAN mismatch fixed for 22 products"
];

export const inventoryRows = Array.from({ length: 12 }).map((_, index) => ({
  id: `INV-${1000 + index}`,
  product: `Dyson V12 Detect Vacuum ${index + 1}`,
  sku: `WH-DY-${300 + index}`,
  ean: `40063813339${index.toString().padStart(2, "0")}`,
  price: `$${(429 + index * 5).toFixed(2)}`,
  quantity: 140 - index * 9,
  syncStatus: index % 3 === 0 ? "Healthy" : index % 3 === 1 ? "Pending" : "Error",
  stockStatus: index % 4 === 0 ? "Low" : "In Stock"
}));

export const marketplaceCards = [
  { name: "Otto", status: "Connected", syncHealth: "98%", products: 1284, failed: 6 },
  { name: "Kaufland", status: "Connected", syncHealth: "95%", products: 960, failed: 12 },
  { name: "Hood", status: "Degraded", syncHealth: "83%", products: 504, failed: 29 }
];

export const warehouseGrid = [
  ["A1", "A2", "A3", "A4"],
  ["B1", "B2", "B3", "B4"],
  ["C1", "C2", "C3", "C4"],
  ["D1", "D2", "D3", "D4"],
  ["E1", "E2", "E3", "E4"]
];

export const zoneSummary = [
  { zone: "receiving", occupancy: 72, activePicks: 14 },
  { zone: "fast_moving", occupancy: 88, activePicks: 26 },
  { zone: "bulk_storage", occupancy: 64, activePicks: 9 },
  { zone: "returns", occupancy: 41, activePicks: 6 }
];

export const permissionRows = [
  { scope: "Inventory", access: "Read / Write" },
  { scope: "Marketplace", access: "Admin" },
  { scope: "Warehouse Map", access: "Read" },
  { scope: "API Management", access: "Owner" }
];
