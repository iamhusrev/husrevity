"use client";
import AppLogo from "@/components/logo/AppLogo";
import TodaySuggestionsModal from "@/components/ai/TodaySuggestionsModal";
import { HOME_PAGE } from "@/utils/constants-url";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CiGrid41, CiSettings } from "react-icons/ci";
import {
  BiNote,
  BiBell,
  BiLockAlt,
  BiListUl,
  BiFolder,
  BiTargetLock,
  BiCalendar,
  BiEnvelope,
  BiWallet,
  BiShield,
} from "react-icons/bi";
import { useAuth } from "@/providers/AuthProvider";
import { HiSparkles, HiOutlineClock } from "react-icons/hi2";
import { FaChevronDown } from "react-icons/fa";
import { useSidebar } from "@/providers/SidebarContext";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  new?: boolean;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

type TFunc = (key: string) => string;

const getNavItems = (t: TFunc, isAdmin: boolean): NavItem[] => [
  {
    icon: <CiGrid41 size={"1.5rem"} />,
    name: t("nav.dashboard"),
    path: "/dashboard",
  },
  {
    icon: <BiBell size={"1.5rem"} />,
    name: t("nav.reminders"),
    path: "/reminders",
  },
  {
    icon: <BiNote size={"1.5rem"} />,
    name: t("nav.notes"),
    path: "/notes",
  },
  {
    icon: <BiFolder size={"1.5rem"} />,
    name: t("nav.projects"),
    path: "/projects",
  },
  {
    icon: <HiOutlineClock size={"1.5rem"} />,
    name: t("nav.evkat"),
    path: "/evkat",
  },
  {
    icon: <BiListUl size={"1.5rem"} />,
    name: t("nav.lists"),
    path: "/lists",
  },
  {
    icon: <BiTargetLock size={"1.5rem"} />,
    name: t("nav.plans"),
    path: "/plans",
  },
  {
    icon: <BiCalendar size={"1.5rem"} />,
    name: t("nav.calendar"),
    path: "/calendar",
  },
  {
    icon: <BiWallet size={"1.5rem"} />,
    name: t("nav.finance"),
    path: "/finance",
  },
  {
    icon: <BiEnvelope size={"1.5rem"} />,
    name: t("nav.gmail"),
    path: "/gmail",
  },
  {
    icon: <HiSparkles size={"1.5rem"} />,
    name: t("nav.ai"),
    path: "/ai",
  },
  {
    icon: <BiLockAlt size={"1.5rem"} />,
    name: t("nav.vault"),
    path: "/vault",
  },
  ...(isAdmin
    ? [
        {
          icon: <BiShield size={"1.5rem"} />,
          name: t("nav.admin"),
          subItems: [{ name: t("nav.adminUsers"), path: "/admin/users" }],
        } as NavItem,
      ]
    : []),
  {
    icon: <CiSettings size={"1.5rem"} />,
    name: t("nav.settings"),
    subItems: [{ name: t("nav.profile"), path: "/settings/profile" }],
  },
];
const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showSuggestions, setShowSuggestions] = useState(false);

  const isActive = useCallback((path: string) => path === pathname, [pathname]);

  useEffect(() => {
    let submenuMatched = false;
    getNavItems(t, isAdmin).forEach((nav, index) => {
      nav.subItems?.forEach((subItem) => {
        if (isActive(subItem.path)) {
          setOpenSubmenu({ type: "main", index });
          submenuMatched = true;
        }
      });
    });
    if (!submenuMatched) setOpenSubmenu(null);
  }, [pathname, isActive, t]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `main-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prev) => ({
          ...prev,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number) => {
    setOpenSubmenu((prev) => (prev && prev.index === index ? null : { type: "main", index }));
  };

  const renderMenuItems = (navItems: NavItem[]) => (
    <ul className="flex flex-col gap-1">
      {navItems.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index)}
              className={`menu-item group cursor-pointer ${
                openSubmenu?.index === index ? "menu-item-active" : "menu-item-inactive"
              } ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"}`}
            >
              <span
                className={`${
                  openSubmenu?.index === index ? "menu-item-icon-active" : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <FaChevronDown
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                    openSubmenu?.index === index ? "rotate-180 text-brand-500" : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`${
                    isActive(nav.path) ? "menu-item-icon-active" : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`main-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.index === index ? `${subMenuHeight[`main-${index}`]}px` : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      href={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`fixed flex flex-col xl:mt-0 top-0 px-5 left-0 bg-husrev-cream/85 dark:bg-husrev-ink/70 backdrop-blur-sm text-husrev-ink dark:text-husrev-cream h-full transition-all duration-300 ease-in-out z-50 border-r border-husrev-sand/70 dark:border-white/5 ${
        isExpanded || isMobileOpen ? "w-[290px]" : isHovered ? "w-[290px]" : "w-[90px]"
      } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} xl:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex ${
          !isExpanded && !isHovered ? "xl:justify-center" : "justify-center"
        }`}
      >
        <Link href={HOME_PAGE}>
          <AppLogo collapsed={!(isExpanded || isHovered || isMobileOpen)} />
        </Link>
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>{renderMenuItems(getNavItems(t, isAdmin))}</div>
          </div>
        </nav>

        <div className="mt-auto pb-4">
          {isExpanded || isHovered || isMobileOpen ? (
            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              aria-label={t("sidebarPanel.ctaTitle")}
              className="group relative block w-full overflow-hidden rounded-xl ring-1 ring-husrev-sand bg-husrev-cream/80 dark:bg-white/[0.03] dark:ring-white/[0.06] p-3.5 grain text-left transition hover:-translate-y-px hover:ring-husrev-amber/60 hover:bg-husrev-cream dark:hover:bg-white/[0.05] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber motion-reduce:hover:translate-y-0"
            >
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-husrev-ink dark:bg-husrev-cream transition group-hover:bg-husrev-ember">
                  <HiSparkles className="h-4 w-4 text-husrev-amber" />
                </div>
                <div className="text-[12.5px] leading-snug text-gray-600 dark:text-gray-300">
                  <span className="font-instrument-serif italic text-[15px] text-husrev-ink dark:text-husrev-cream">
                    {t("sidebarPanel.ctaTitle")}
                  </span>
                  <p className="mt-0.5 text-gray-500 dark:text-gray-400">
                    {t("sidebarPanel.ctaBody")}
                  </p>
                </div>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              aria-label={t("sidebarPanel.ctaTitle")}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-husrev-ink dark:bg-husrev-cream transition hover:bg-husrev-ember focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
            >
              <HiSparkles className="h-4 w-4 text-husrev-amber" />
            </button>
          )}
        </div>

        <TodaySuggestionsModal
          isOpen={showSuggestions}
          onClose={() => setShowSuggestions(false)}
        />
      </div>
    </aside>
  );
};

export default AppSidebar;
