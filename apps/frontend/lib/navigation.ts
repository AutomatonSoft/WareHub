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
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sofort-list", label: "Sofort list", icon: List },
  { href: "/create-product", label: "Create product", icon: PlusSquare },
  { href: "/product-editor", label: "Product Editor", icon: PencilRuler },
  { href: "/marketplace", label: "Marketplace", icon: ChartColumnBig },
  { href: "/warehouse-map", label: "WareHouseMap", icon: Map }
] as const;

export const adminNavigationItem = {
  href: "/admin/users",
  label: "Admin users",
  icon: Users
} as const;

export const telegramAdminNavigationItem = {
  href: "/admin/telegram-access",
  label: "Telegram access",
  icon: ShieldCheck,
} as const;
