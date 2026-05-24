import type { Metadata } from "next";
import InviteAcceptView from "@/views/auth/InviteAcceptView";

export const metadata: Metadata = {
  title: "Davete katıl | Husrevity",
  description: "Husrevity'ye katılmak için davetini kabul et ve şifreni belirle.",
};

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteAcceptView token={token} />;
}
