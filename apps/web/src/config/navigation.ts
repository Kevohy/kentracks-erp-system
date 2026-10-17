import {
  CalendarDays,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Package,
  Receipt,
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
      { label: "Suppliers", href: "/crm/suppliers" },
      { label: "Technicians", href: "/crm/technicians" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Package,
    children: [
      { label: "Inventory", href: "/inventory/inventory" },
      { label: "Purchases", href: "/inventory/purchases" },
    ],
  },
  { id: "sales", label: "Sales", icon: TrendingUp, href: "/sales" },
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
    if (item.href && item.href !== "/") paths.push(item.href.split("/").filter(Boolean));
    for (const c of item.children ?? []) {
      if (!c.built) paths.push(c.href.split("/").filter(Boolean));
    }
  }
  return paths;
}
