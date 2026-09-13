"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/quorly/brand-mark";
import { NavUser } from "@/components/nav-user";
import type { Member } from "@/lib/api";
import {
  IconCoin,
  IconDroplet,
  IconFileText,
  IconLayoutDashboard,
  IconScale,
  IconUsers,
  IconWallet,
} from "@tabler/icons-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const OPERATE = [
  { title: "Overview", url: "/dashboard", icon: IconLayoutDashboard },
  { title: "Invoices", url: "/dashboard/invoices", icon: IconFileText },
  { title: "Payments", url: "/dashboard/payments", icon: IconCoin },
];

const GOVERN = [
  { title: "Policy", url: "/dashboard/policy", icon: IconScale },
  { title: "Team", url: "/dashboard/team", icon: IconUsers },
];

const TOOLS = [
  { title: "Wallet", url: "/dashboard/wallet", icon: IconWallet },
  { title: "Faucet", url: "/dashboard/faucet", icon: IconDroplet },
];

export function AppSidebar({
  member,
  ...props
}: React.ComponentProps<typeof Sidebar> & { member: Member }) {
  const pathname = usePathname();

  // "/dashboard" is a prefix of every other route, so it needs exact matching.
  const isActive = (url: string) =>
    url === "/dashboard" ? pathname === url : pathname.startsWith(url);

  const group = (label: string, items: typeof OPERATE) => (
    <SidebarGroup key={label}>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                isActive={isActive(item.url)}
                tooltip={item.title}
                render={<Link href={item.url} />}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:!p-1.5"
              render={<Link href="/dashboard" />}
            >
              <BrandMark size="sm" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {group("Operate", OPERATE)}
        {group("Govern", GOVERN)}
        {group("Tools", TOOLS)}
      </SidebarContent>

      <SidebarFooter>
        <NavUser member={member} />
      </SidebarFooter>
    </Sidebar>
  );
}
