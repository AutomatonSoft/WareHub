import {
  ChartColumnBig,
  LayoutDashboard,
  List,
  Map,
  PlusSquare,
  PencilRuler,
  ShieldCheck,
  Users,
} from "lucide-react";

export const navigationItems = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/sofort-list", labelKey: "navSofortList", icon: List },
  { href: "/create-product", labelKey: "navCreateProduct", icon: PlusSquare },
  { href: "/product-editor", labelKey: "navProductEditor", icon: PencilRuler },
  { href: "/marketplace", labelKey: "navMarketplace", icon: ChartColumnBig },
  { href: "/warehouse-map", labelKey: "navWarehouseMap", icon: Map }
] as const;

export const adminNavigationItem = {
  href: "/admin/users",
  labelKey: "navAdminUsers",
  icon: Users
} as const;

export const telegramAdminNavigationItem = {
  href: "/admin/telegram-access",
  labelKey: "navTelegramAccess",
  icon: ShieldCheck,
} as const;
