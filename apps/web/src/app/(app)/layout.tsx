"use client";

import { useAuth } from "@/providers/AuthProvider";
import { useSidebar } from "@/providers/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import MobileBottomNav from "@/layout/MobileBottomNav";
import NotificationPermissionPrompt from "@/components/notifications/NotificationPermissionPrompt";
import QuickAddDialog from "@/components/quick-add/QuickAddDialog";
import { useQuickAddShortcut } from "@/hooks/useQuickAddShortcut";
import { QuickAddProvider, useQuickAdd } from "@/providers/QuickAddContext";
import { LOGIN_PAGE } from "@/utils/constants-url";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const { isExpanded, isHovered } = useSidebar();
  const router = useRouter();
  const { open: showQuickAdd, setOpen: setShowQuickAdd, openQuickAdd } = useQuickAdd();

  // Redirect user only when auth status is known
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace(LOGIN_PAGE);
    }
  }, [loading, isAuthenticated, router]);

  // Global ⌘K / Ctrl+K opens quick-add from anywhere in the app.
  useQuickAddShortcut(openQuickAdd);

  // IMPORTANT: Prevent UI from rendering before redirect
  if (loading || !isAuthenticated) {
    return null;
  }

  const mainContentMargin = isExpanded || isHovered ? "xl:ml-[290px]" : "xl:ml-[90px]";

  return (
    <div className="h-dvh overflow-hidden xl:flex bg-husrev-cream dark:bg-husrev-ink">
      <AppSidebar />
      <div
        className={`flex h-dvh min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out ${mainContentMargin}`}
      >
        <AppHeader />
        <main className="relative grain min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-24 xl:pb-6">
          <div className="mx-auto flex min-h-full w-full max-w-(--breakpoint-2xl) flex-col">
            <NotificationPermissionPrompt />
            {children}
          </div>
        </main>
      </div>
      <MobileBottomNav />
      <QuickAddDialog open={showQuickAdd} onOpenChange={setShowQuickAdd} />
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <QuickAddProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </QuickAddProvider>
  );
}
