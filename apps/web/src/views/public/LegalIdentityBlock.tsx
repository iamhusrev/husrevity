import { content, type PublicLanguage } from "./content";
import type { LegalIdentity } from "./legal";

/** Shows the operator identity from the API, or a neutral line when absent. */
export default function LegalIdentityBlock({
  lang,
  identity,
}: {
  lang: PublicLanguage;
  identity: LegalIdentity;
}) {
  const t = content[lang].legal;
  const { operatorName, contactEmail } = identity;

  if (!operatorName && !contactEmail) {
    return <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">{t.notConfigured}</p>;
  }

  return (
    <div className="mt-8 space-y-1 text-sm">
      {operatorName && (
        <p>
          {t.operatorLabel}: <span className="font-medium">{operatorName}</span>
        </p>
      )}
      {contactEmail && (
        <p>
          {t.contactLabel}:{" "}
          <a href={`mailto:${contactEmail}`} className="underline">
            {contactEmail}
          </a>
        </p>
      )}
    </div>
  );
}
