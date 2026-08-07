import type { Metadata } from "next";
import ProjectInviteAcceptView from "@/views/auth/ProjectInviteAcceptView";

export const metadata: Metadata = {
  title: "Proje davetini kabul et | Husrevity",
  description: "Bir projeye katılmak için davetini kabul et veya hesabını oluştur.",
};

export default async function ProjectInviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ProjectInviteAcceptView token={token} />;
}
