import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page is rendered per request: it gets the CSP nonce from src/proxy.ts, and signed-in pages are never
  // stored by browsers or CDNs (Next.js sends "private, no-store" for dynamic pages).
  await connection();
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
