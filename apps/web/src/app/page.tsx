import type { Metadata } from "next";

import { content } from "@/views/public/content";
import HomeView from "@/views/public/HomeView";
import { languageForRequest, type PublicSearchParams } from "@/views/public/page-helpers";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: PublicSearchParams;
}): Promise<Metadata> {
  const lang = await languageForRequest(searchParams);
  return { title: { absolute: "Husrevity" }, description: content[lang].home.description };
}

export default async function RootPage({ searchParams }: { searchParams: PublicSearchParams }) {
  const lang = await languageForRequest(searchParams);
  return <HomeView lang={lang} />;
}
