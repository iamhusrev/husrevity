"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import { CiSettings } from "react-icons/ci";
import { BiLink, BiNote, BiCalendar, BiDumbbell, BiLockAlt, BiShield, BiBookOpen } from "react-icons/bi";
import { HiOutlineClock } from "react-icons/hi2";
import { useAuth } from "@/providers/AuthProvider";

type DigerItem = { key: string; path: string; icon: IconType };

const ITEMS: DigerItem[] = [
  { key: "nav.notes", path: "/notes", icon: BiNote },
  { key: "nav.calendar", path: "/calendar", icon: BiCalendar },
  { key: "nav.evkat", path: "/evkat", icon: HiOutlineClock },
  { key: "nav.learning", path: "/learning", icon: BiBookOpen },
  { key: "nav.sport", path: "/sport", icon: BiDumbbell },
  { key: "nav.vault", path: "/vault", icon: BiLockAlt },
];

const ADMIN_ITEM: DigerItem = { key: "nav.admin", path: "/admin/users", icon: BiShield };
const INTEGRATIONS_ITEM: DigerItem = { key: "nav.integrations", path: "/settings/integrations", icon: BiLink };
const SETTINGS_ITEM: DigerItem = { key: "nav.settings", path: "/settings/profile", icon: CiSettings };

/**
 * Faz 2 catch-all: everything that no longer has a primary nav slot
 * (Reminders, Calendar, Evkat, Learning, Sport, Vault, Admin, Settings)
 * lives here — their data is superseded by the unified Item model and the
 * Bugün screen, but the pages stay reachable while the old tables are
 * still live.
 */
export default function DigerPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const items = [...ITEMS, ...(user?.role === "admin" ? [ADMIN_ITEM] : []), INTEGRATIONS_ITEM, SETTINGS_ITEM];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
        {t("nav.more")}
      </span>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
        {t("nav.more")}
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(({ key, path, icon: Icon }) => (
          <Link
            key={path}
            href={path}
            className="flex flex-col items-center gap-2 rounded-2xl bg-white p-5 text-center ring-1 ring-husrev-sand shadow-card-warm transition hover:-translate-y-px hover:ring-husrev-amber/60 dark:bg-husrev-shadow dark:ring-white/[0.06]"
          >
            <Icon size={26} className="text-husrev-ember dark:text-husrev-amber" />
            <span className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
              {t(key)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
