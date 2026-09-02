"use client";

import { useAuth } from "@/providers/AuthProvider";
import { useSidebar } from "@/providers/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import MobileBottomNav from "@/layout/MobileBottomNav";
import NotificationPermissionPrompt from "@/components/notifications/NotificationPermissionPrompt";
import { LOGIN_PAGE } from "@/utils/constants-url";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const { isExpanded, isHovered } = useSidebar();
  const router = useRouter();

  // Redirect user only when auth status is known
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace(LOGIN_PAGE);
    }
  }, [loading, isAuthenticated, router]);

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
          {/*
            min-h-full + flex flex-col is the key to making both layout
            modes coexist:
              - "fill-viewport" pages (Calendar / Vault / Reminders) use
                `flex-1 min-h-0` on their root and fill the remaining space
                after the prompt (when shown).
              - "natural-flow" pages (Evkat hour-stack, Notes, Projects, …)
                size to content; when total exceeds the viewport, the
                wrapper grows beyond `min-h-full` and <main> scrolls.
            Putting `h-full` here instead — as before — pegged the wrapper
            to main's clientHeight, so additions like the permission prompt
            pushed children past the viewport without ever triggering
            <main>'s overflow-y-auto.
            The extra bottom padding below xl clears the fixed MobileBottomNav.
            Note: The PageShell component now encodes this layout contract in code.
          */}
          <div className="mx-auto flex min-h-full w-full max-w-(--breakpoint-2xl) flex-col">
            <NotificationPermissionPrompt />
            {children}
          </div>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
