"use client";

import { usePathname } from "next/navigation";
import { SignInButton } from "@/components/quorly/auth";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/invoices": "Invoices",
  "/dashboard/payments": "Payments",
  "/dashboard/policy": "Policy",
  "/dashboard/team": "Team",
  "/dashboard/faucet": "Faucet",
};

export function SiteHeader() {
  const pathname = usePathname();
  const title =
    TITLES[pathname] ??
    (pathname.startsWith("/dashboard/invoices") ? "Invoice" : "Dashboard");

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="text-base font-medium">{title}</h1>

        <div className="ml-auto flex items-center gap-4">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="size-1.5 rounded-full bg-forest" />
            Base Sepolia
          </span>
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
