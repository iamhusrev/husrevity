import type { Metadata } from "next";
import AdminUsersPage from "@/views/admin/AdminUsersPage";

export const metadata: Metadata = {
  title: "Kullanıcılar | Admin",
  description: "Sistem kullanıcılarını yönet, davet et, rol ata.",
};

export default function Page() {
  return <AdminUsersPage />;
}
