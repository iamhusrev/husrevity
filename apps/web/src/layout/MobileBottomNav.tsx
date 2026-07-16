"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import { CiGrid41, CiSettings } from "react-icons/ci";
import {
  BiBell,
  BiNote,
  BiCalendar,
  BiDotsHorizontalRounded,
  BiFolder,
  BiListUl,
  BiBookOpen,
  BiDumbbell,
  BiTargetLock,
  BiWallet,
  BiLockAlt,
  BiShield,
} from "react-icons/bi";
import { HiOutlineClock } from "react-icons/hi2";
import { useAuth } from "@/providers/AuthProvider";

type MoreItem = { key: string; path: string; icon: IconType };

const MORE_ITEMS: MoreItem[] = [
  { key: "nav.projects", path: "/projects", icon: BiFolder },
  { key: "nav.evkat", path: "/evkat", icon: HiOutlineClock },
  { key: "nav.lists", path: "/lists", icon: BiListUl },
  { key: "nav.readings", path: "/readings", icon: BiBookOpen },
  { key: "nav.sport", path: "/sport", icon: BiDumbbell },
  { key: "nav.plans", path: "/plans", icon: BiTargetLock },
  { key: "nav.finance", path: "/finance", icon: BiWallet },
  { key: "nav.vault", path: "/vault", icon: BiLockAlt },
];

const ADMIN_ITEM: MoreItem = { key: "nav.admin", path: "/admin/users", icon: BiShield };
const SETTINGS_ITEM: MoreItem = { key: "nav.settings", path: "/settings/profile", icon: CiSettings };

function MoreSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  const items = [...MORE_ITEMS, ...(user?.role === "admin" ? [ADMIN_ITEM] : []), SETTINGS_ITEM];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] bg-husrev-ink/40 backdrop-blur-sm xl:hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("nav.more")}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card-warm dark:bg-husrev-shadow husrev-settle"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-husrev-sand dark:bg-white/10" />
        <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
          {t("nav.more")}
        </span>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {items.map(({ key, path, icon: Icon }) => {
            const active = pathname === path || pathname.startsWith(`${path}/`);
            return (
              <Link
                key={path}
                href={path}
                onClick={onClose}
                className={`flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center transition ${
                  active
                    ? "bg-husrev-amber/15 text-husrev-ember dark:text-husrev-amber"
                    : "text-gray-600 hover:bg-husrev-cream dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                <Icon size={22} />
                <span className="text-[11px] font-medium leading-tight">{t(key)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const TABS: { key: string; path: string; icon: IconType }[] = [
  { key: "nav.reminders", path: "/reminders", icon: BiBell },
  { key: "nav.notes", path: "/notes", icon: BiNote },
];

const TABS_RIGHT: { key: string; path: string; icon: IconType }[] = [
  { key: "nav.calendar", path: "/calendar", icon: BiCalendar },
];

export default function MobileBottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  // Route changes (e.g. via a sheet link) must always dismiss the sheet.
  useEffect(() => {
    setShowMore(false);
  }, [pathname]);

  const tabClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 transition-colors ${
      active
        ? "text-husrev-ember dark:text-husrev-amber"
        : "text-gray-500 dark:text-gray-400"
    }`;

  return (
    <>
      <nav
        aria-label={t("nav.more")}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-husrev-sand/70 bg-husrev-cream/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] dark:border-white/5 dark:bg-husrev-ink/90 xl:hidden"
      >
        <div className="grid h-16 grid-cols-5">
          {TABS.map(({ key, path, icon: Icon }) => (
            <Link key={path} href={path} className={tabClass(pathname === path)}>
              <Icon size={22} />
              <span className="text-[10px] font-medium">{t(key)}</span>
            </Link>
          ))}

          <div className="relative flex justify-center">
            <Link
              href="/dashboard"
              aria-label={t("nav.dashboard")}
              className={`-mt-6 flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-4 ring-husrev-cream transition dark:ring-husrev-ink ${
                pathname === "/dashboard"
                  ? "bg-husrev-ember text-husrev-cream"
                  : "bg-husrev-ink text-husrev-amber dark:bg-husrev-cream dark:text-husrev-ember"
              }`}
            >
              <CiGrid41 size={26} />
            </Link>
          </div>

          {TABS_RIGHT.map(({ key, path, icon: Icon }) => (
            <Link key={path} href={path} className={tabClass(pathname === path)}>
              <Icon size={22} />
              <span className="text-[10px] font-medium">{t(key)}</span>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setShowMore(true)}
            className={tabClass(showMore)}
            aria-label={t("nav.more")}
          >
            <BiDotsHorizontalRounded size={22} />
            <span className="text-[10px] font-medium">{t("nav.more")}</span>
          </button>
        </div>
      </nav>

      <MoreSheet isOpen={showMore} onClose={() => setShowMore(false)} />
    </>
  );
}
