import type { Metadata } from "next";

import { content } from "@/views/public/content";
import DocumentView from "@/views/public/DocumentView";
import { fetchLegalIdentity } from "@/views/public/legal";
import { languageForRequest, type PublicSearchParams } from "@/views/public/page-helpers";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: PublicSearchParams;
}): Promise<Metadata> {
  const lang = await languageForRequest(searchParams);
  return { title: content[lang].privacy.title };
}

export default async function PrivacyPage({ searchParams }: { searchParams: PublicSearchParams }) {
  const lang = await languageForRequest(searchParams);
  const identity = await fetchLegalIdentity();
  const t = content[lang].privacy;
  return (
    <DocumentView
      lang={lang}
      path="/privacy"
      title={t.title}
      intro={t.intro}
      sections={t.sections}
      identity={identity}
      showGooglePolicyLink
    />
  );
}
