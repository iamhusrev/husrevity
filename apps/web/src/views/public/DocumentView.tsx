import { content, GOOGLE_POLICY_URL, type PublicLanguage, type Section } from "./content";
import LegalIdentityBlock from "./LegalIdentityBlock";
import type { LegalIdentity } from "./legal";
import PublicShell from "./PublicShell";

interface DocumentViewProps {
  lang: PublicLanguage;
  path: "/privacy" | "/terms";
  title: string;
  intro: string;
  sections: Section[];
  identity: LegalIdentity;
  showGooglePolicyLink?: boolean;
}

/** Shared layout for the privacy and terms pages. */
export default function DocumentView({
  lang,
  path,
  title,
  intro,
  sections,
  identity,
  showGooglePolicyLink = false,
}: DocumentViewProps) {
  const policy = content[lang].googlePolicy;
  return (
    <PublicShell lang={lang} path={path}>
      <h1 className="text-3xl font-medium">{title}</h1>
      <p className="mt-3 text-gray-700 dark:text-gray-300">{intro}</p>
      {sections.map((s) => (
        <section key={s.heading} className="mt-8">
          <h2 className="text-xl font-medium">{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p} className="mt-2">
              {p}
            </p>
          ))}
          {s.bullets && (
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {showGooglePolicyLink && (
        <p className="mt-4">
          <a href={GOOGLE_POLICY_URL} className="underline" rel="noopener noreferrer">
            {policy.name}
          </a>
        </p>
      )}
      <LegalIdentityBlock lang={lang} identity={identity} />
    </PublicShell>
  );
}
