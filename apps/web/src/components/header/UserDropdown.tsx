"use client";

import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaChevronDown, FaUser } from "react-icons/fa";
import { Dropdown } from "../dropdown/Dropdown";

// ── Icons ─────────────────────────────────────────────────────────────────────

function ProfileIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="fill-gray-500 group-hover:fill-gray-700 dark:fill-gray-400 dark:group-hover:fill-gray-300"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 3.5C7.30558 3.5 3.5 7.30558 3.5 12C3.5 14.1526 4.3002 16.1184 5.61936 17.616C6.17279 15.3096 8.24852 13.5955 10.7246 13.5955H13.2746C15.7509 13.5955 17.8268 15.31 18.38 17.6167C19.6996 16.119 20.5 14.153 20.5 12C20.5 7.30558 16.6944 3.5 12 3.5ZM17.0246 18.8566V18.8455C17.0246 16.7744 15.3457 15.0955 13.2746 15.0955H10.7246C8.65354 15.0955 6.97461 16.7744 6.97461 18.8455V18.856C8.38223 19.8895 10.1198 20.5 12 20.5C13.8798 20.5 15.6171 19.8898 17.0246 18.8566ZM2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12Z"
        fill=""
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="fill-gray-500 group-hover:fill-error-500 dark:fill-gray-400 dark:group-hover:fill-error-400"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15 3.5H19C19.8284 3.5 20.5 4.17157 20.5 5V19C20.5 19.8284 19.8284 20.5 19 20.5H15C14.5858 20.5 14.25 20.1642 14.25 19.75C14.25 19.3358 14.5858 19 15 19H19V5H15C14.5858 5 14.25 4.66421 14.25 4.25C14.25 3.83579 14.5858 3.5 15 3.5ZM10.4697 7.46967C10.7626 7.17678 11.2374 7.17678 11.5303 7.46967L15.5303 11.4697C15.8232 11.7626 15.8232 12.2374 15.5303 12.5303L11.5303 16.5303C11.2374 16.8232 10.7626 16.8232 10.4697 16.5303C10.1768 16.2374 10.1768 15.7626 10.4697 15.4697L13.1893 12.75H3.75C3.33579 12.75 3 12.4142 3 12C3 11.5858 3.33579 11.25 3.75 11.25H13.1893L10.4697 8.53033C10.1768 8.23744 10.1768 7.76256 10.4697 7.46967Z"
        fill=""
      />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 dropdown-toggle text-gray-700 dark:text-gray-400 bg-white dark:bg-gray-dark border border-gray-200 dark:border-gray-800 rounded-full h-11 px-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
      >
        <FaUser className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
        <span className="font-medium text-sm max-w-[120px] truncate">
          {user ? `${user.firstName} ${user.lastName}` : "User"}
        </span>
        <FaChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute right-0 mt-[17px] flex w-[240px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        {/* User info */}
        <div className="px-1 pb-3 mb-1 border-b border-gray-100 dark:border-gray-800">
          <span className="block font-semibold text-sm text-gray-800 dark:text-white truncate">
            {user ? `${user.firstName} ${user.lastName}` : ""}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {user?.email}
          </span>
        </div>

        {/* Profile link */}
        <ul className="py-1 border-b border-gray-100 dark:border-gray-800">
          <li>
            <Link
              href="/settings/profile"
              onClick={() => setIsOpen(false)}
              className="group flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5 transition-colors"
            >
              <ProfileIcon />
              {t("profile.title")}
            </Link>
          </li>
        </ul>

        {/* Logout */}
        <button
          onClick={() => {
            setIsOpen(false);
            logout();
          }}
          className="group flex items-center gap-3 px-3 py-2 mt-1 text-sm font-medium text-gray-700 rounded-lg hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-500/10 dark:text-gray-400 dark:hover:text-error-400 transition-colors"
        >
          <LogoutIcon />
          {t("appheader.logout")}
        </button>
      </Dropdown>
    </div>
  );
}
