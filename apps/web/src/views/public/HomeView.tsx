import Link from "next/link";

import { content, type PublicLanguage } from "./content";
import { HOME_REDIRECT_SCRIPT } from "./home-redirect-script";
import PublicShell from "./PublicShell";

export default function HomeView({ lang }: { lang: PublicLanguage }) {
  const t = content[lang].home;
  return (
    <PublicShell lang={lang} path="/">
      {/* Static string (no user input): redirects visitors with a session before first paint. */}
      <script dangerouslySetInnerHTML={{ __html: HOME_REDIRECT_SCRIPT }} />
      <h1 className="mt-8 text-4xl font-medium">Husrevity</h1>
      <p className="mt-2 text-xl">{t.tagline}</p>
      <p className="mt-4 text-gray-700 dark:text-gray-300">{t.description}</p>
      <div className="mt-6 flex gap-3">
        <Link href="/login" className="rounded-md bg-gray-900 px-4 py-2 text-white dark:bg-gray-100 dark:text-gray-900">
          {t.signIn}
        </Link>
        <Link href="/register" className="rounded-md border border-gray-400 px-4 py-2">
          {t.register}
        </Link>
      </div>
      <h2 className="mt-12 text-2xl font-medium">{t.featuresHeading}</h2>
      <ul className="mt-4 space-y-3">
        {t.features.map((f) => (
          <li key={f.title}>
            <span className="font-medium">{f.title}.</span> {f.body}
          </li>
        ))}
      </ul>
      <h2 className="mt-12 text-2xl font-medium">{t.googleHeading}</h2>
      <p className="mt-2">{t.googleBody}</p>
    </PublicShell>
  );
}
