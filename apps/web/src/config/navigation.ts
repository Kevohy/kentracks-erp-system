import {
  CalendarDays,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Package,
  Receipt,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavChild = { label: string; href: string; /** True once the page has its own implementation. */ built?: boolean };

export type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Present for items that navigate directly. */
  href?: string;
  /** True once the page has its own implementation (direct items only). */
  built?: boolean;
  /** Present for items that expand into sub-items. */
  children?: NavChild[];
};

/** The ERP menu. Order and labels are fixed by the product owner. */
export const navigation: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/" },
  {
    id: "crm",
    label: "CRM",
    icon: Users,
    children: [
      { label: "Customers", href: "/crm/customers", built: true },
      { label: "Suppliers", href: "/crm/suppliers", built: true },
      { label: "Technicians", href: "/crm/technicians", built: true },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Package,
    children: [
      { label: "Dashboard", href: "/inventory/dashboard", built: true },
      { label: "Products", href: "/inventory/products", built: true },
      { label: "SIM Cards", href: "/inventory/sim-cards", built: true },
      { label: "Platforms", href: "/inventory/platforms", built: true },
      { label: "Purchases", href: "/inventory/purchases", built: true },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: TrendingUp,
    children: [
      { label: "All Sales", href: "/sales", built: true },
      { label: "Package Sale", href: "/sales/package", built: true },
      { label: "Hosting Sale", href: "/sales/hosting", built: true },
      { label: "Retailer Sale", href: "/sales/retailer", built: true },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    children: [{ label: "Expenses", href: "/finance/expenses" }],
  },
  {
    id: "billing",
    label: "Billing",
    icon: Receipt,
    children: [
      { label: "Renewal Center", href: "/billing/renewal-center" },
      { label: "IoT SIM", href: "/billing/iot-sim" },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: MessageSquare,
    children: [
      { label: "Bulk SMS", href: "/communication/bulk-sms" },
      { label: "Airtime", href: "/communication/airtime" },
      { label: "GPS Platform", href: "/communication/gps-platform" },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileText,
    children: [
      { label: "Certificates", href: "/documents/certificates" },
      { label: "Invoices", href: "/documents/invoices" },
      { label: "Quotations", href: "/documents/quotations" },
    ],
  },
  { id: "booking", label: "Booking", icon: CalendarDays, href: "/booking" },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    children: [{ label: "Packages", href: "/settings/packages", built: true }],
  },
];

export type RouteInfo = {
  title: string;
  crumbs: string[];
  icon: LucideIcon;
};

/** Resolve a pathname to its menu entry, or undefined if it is not in the menu. */
export function findRoute(pathname: string): RouteInfo | undefined {
  for (const item of navigation) {
    if (item.href === pathname) {
      return { title: item.label, crumbs: [item.label], icon: item.icon };
    }
    const child = item.children?.find((c) => c.href === pathname);
    if (child) {
      return { title: child.label, crumbs: [item.label, child.label], icon: item.icon };
    }
  }
  return undefined;
}

export function allPlaceholderPaths(): string[][] {
  const paths: string[][] = [];
  for (const item of navigation) {
    if (item.href && item.href !== "/" && !item.built) paths.push(item.href.split("/").filter(Boolean));
    for (const c of item.children ?? []) {
      if (!c.built) paths.push(c.href.split("/").filter(Boolean));
    }
  }
  return paths;
}
