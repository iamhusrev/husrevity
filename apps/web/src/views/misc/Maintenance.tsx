"use client";

import GridShape from "@/components/common/GridShape";
import { useTranslation } from "react-i18next";
import Image from "next/image";
import Link from "next/link";

export default function Maintenance() {
  const { t } = useTranslation();

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-6 overflow-hidden">
      <GridShape />

      <div className="text-center max-w-[555px] mx-auto">
        <div className="mx-auto mb-10 max-w-[204px]">
          <Image
            src="/images/error/maintenance.svg"
            alt="maintenance"
            width={205}
            height={205}
            className="dark:hidden"
          />
          <Image
            src="/images/error/maintenance-dark.svg"
            alt="maintenance dark"
            width={205}
            height={205}
            className="hidden dark:block"
          />
        </div>

        <h1 className="mb-2 font-bold text-gray-800 text-title-md dark:text-white xl:text-title-2xl">
          {t("errors.maintenanceMode.title")}
        </h1>

        <p className="mt-6 mb-6 text-base text-gray-700 dark:text-gray-400">
          {t("errors.maintenanceMode.message")}
        </p>

        <Link
          href="/"
          className="px-5 py-3 rounded-lg border border-gray-300 bg-white text-sm shadow-theme-xs dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"
        >
          {t("errors.common.backHome")}
        </Link>
      </div>

      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm text-gray-500 dark:text-gray-400">
        © {new Date().getFullYear()} — husrevity
      </p>
    </div>
  );
}
