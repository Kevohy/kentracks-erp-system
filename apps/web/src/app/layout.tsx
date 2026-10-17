import type { Metadata, Viewport } from "next";
import "@fontsource-variable/jost";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { InventoryProvider } from "@/components/inventory/InventoryProvider";
import { SalesProvider } from "@/components/sales/SalesProvider";

export const metadata: Metadata = {
  title: { default: "Kentracks ERP", template: "%s · Kentracks ERP" },
  description: "Kentracks ERP System",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <InventoryProvider>
          <SalesProvider>
            <AppShell>{children}</AppShell>
          </SalesProvider>
        </InventoryProvider>
      </body>
    </html>
  );
}
