import type { Metadata } from "next";
import FinancePage from "@/views/finance/FinancePage";

export const metadata: Metadata = {
  title: "Finans | Husrevity",
  description: "Gelirler, harcamalar, borçlar ve hesap bakiyeleri.",
};

export default function Page() {
  return <FinancePage />;
}
