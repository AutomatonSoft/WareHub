import {
  LayoutDashboard,
  List,
  ListChecks,
  Map,
  PencilRuler,
  ShieldCheck,
  Users,
} from "lucide-react";

export const navigationItems = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/sofort-list", labelKey: "navSofortList", icon: List },
  { href: "/task-statuses", labelKey: "navTaskStatuses", icon: ListChecks },
  { href: "/product-editor", labelKey: "navProductEditor", icon: PencilRuler },
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
