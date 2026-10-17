import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allPlaceholderPaths, findRoute } from "@/config/navigation";
import { Breadcrumbs, PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";

type Params = { slug: string[] };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return allPlaceholderPaths().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const route = findRoute("/" + slug.join("/"));
  return { title: route?.title ?? "Not found" };
}

export default async function PlaceholderPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const route = findRoute("/" + slug.join("/"));
  if (!route) notFound();
  const Icon = route.icon;

  return (
    <>
      <Breadcrumbs items={route.crumbs} />
      <PageHeader title={route.title} />
      <Card className="flex flex-col items-center gap-3.5 px-6 py-16 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-tint text-navy">
          <Icon size={26} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold">{route.title}</h2>
        <p className="max-w-105 text-muted">This page is not designed yet.</p>
      </Card>
    </>
  );
}
