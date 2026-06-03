import {
  Boxes,
  ChartColumnBig,
  LayoutDashboard,
  List,
  Map,
  PanelsTopLeft,
  PlusSquare,
  PencilRuler,
} from "lucide-react";

export const navigationItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sofort-list", label: "Sofort list", icon: List },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/channels", label: "Channels", icon: PanelsTopLeft },
  { href: "/create-product", label: "Create product", icon: PlusSquare },
  { href: "/product-editor", label: "Product Editor", icon: PencilRuler },
  { href: "/marketplace", label: "Marketplace", icon: ChartColumnBig },
  { href: "/warehouse-map", label: "WareHouseMap", icon: Map }
] as const;
