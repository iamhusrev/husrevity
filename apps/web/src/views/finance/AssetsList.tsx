"use client";

import { useTranslation } from "react-i18next";
import { BiPlus, BiBuildingHouse, BiCar, BiCoinStack, BiDiamond, BiMoney, BiWallet } from "react-icons/bi";
import { AssetResponse, formatTRY } from "@/types/finance/finance";
import { ASSET_TYPE_LABELS_TR } from "./AssetModal";

const TYPE_ICON: Record<string, React.ReactNode> = {
  cash: <BiMoney />,
  property: <BiBuildingHouse />,
  vehicle: <BiCar />,
  gold: <BiCoinStack />,
  investment: <BiDiamond />,
  other: <BiWallet />,
};

export function AssetsList({
  assets,
  onEdit,
  onCreate,
}: {
  assets: AssetResponse[];
  onEdit: (a: AssetResponse) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const total = assets.reduce((s, a) => s + a.value, 0);

  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
            {t("finance.section.assets", "Varlıklar")}
          </h3>
          <div className="mt-0.5 tabular-nums text-lg font-semibold text-husrev-moss">
            {formatTRY(total)}
          </div>
        </div>
        <button type="button" onClick={onCreate} className="husrev-btn">
          <BiPlus className="h-4 w-4" />
          {t("finance.newAsset", "Varlık ekle")}
        </button>
      </header>

      {assets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <div className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
            {t("finance.empty.assets.title", "Henüz varlık yok")}
          </div>
          <p className="max-w-sm text-xs text-gray-500 dark:text-gray-400">
            {t(
              "finance.empty.assets.body",
              "Gayrimenkul, araç, altın ya da yatırımlarını ekleyerek net değerini gör.",
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onEdit(a)}
              className="group relative overflow-hidden rounded-2xl bg-white text-left ring-1 ring-husrev-sand/80 p-4 shadow-card-warm husrev-lift focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:bg-husrev-shadow dark:ring-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-husrev-moss/12 text-husrev-moss">
                  {TYPE_ICON[a.type] ?? TYPE_ICON.other}
                </span>
                <span className="husrev-kicker text-gray-400">
                  {t(`finance.assetType.${a.type}`, ASSET_TYPE_LABELS_TR[a.type] ?? a.type)}
                </span>
              </div>
              <div className="mt-2.5 text-base font-medium text-husrev-ink dark:text-husrev-cream truncate">
                {a.name}
              </div>
              <div className="mt-1 tabular-nums text-lg font-semibold text-husrev-ink dark:text-husrev-cream">
                {formatTRY(a.value)}
              </div>
              {a.acquiredAt && (
                <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  {new Date(a.acquiredAt).toLocaleDateString("tr-TR")}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
