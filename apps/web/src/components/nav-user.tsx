"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  IconCheck,
  IconCopy,
  IconDotsVertical,
  IconExternalLink,
  IconLogout,
} from "@tabler/icons-react";

import type { Member } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const EXPLORER = "https://sepolia.basescan.org";

export function NavUser({ member }: { member: Member }) {
  const { logout } = usePrivy();
  const { isMobile } = useSidebar();
  const [copied, setCopied] = useState(false);

  const label = member.name ?? member.email;
  const wallet = member.walletAddress;

  async function copyWallet() {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused outright. The row keeps its title
      // attribute with the full address, so it is still recoverable by hand.
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium">
              {label.charAt(0).toUpperCase()}
            </span>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{label}</span>
              <span className="truncate text-xs text-muted-foreground">{member.email}</span>
            </div>
            <IconDotsVertical className="ml-auto size-4" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-(--anchor-width) min-w-60 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <div className="flex items-center gap-2 px-1.5 py-1.5 text-left text-sm">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium">
                {label.charAt(0).toUpperCase()}
              </span>
              <div className="grid flex-1 leading-tight">
                <span className="truncate font-medium">{label}</span>
                <span className="truncate text-xs text-muted-foreground">{member.email}</span>
              </div>
            </div>

            <DropdownMenuSeparator />

            {/* GroupLabel reads MenuGroupContext, so it throws unless a Group
                provides one — the label and the wallet actions belong to the
                same group anyway. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
                Wallet
              </DropdownMenuLabel>

              {wallet ? (
                <>
                {/* A menu item rather than a bare button, so the keyboard can
                    reach it — Base UI only rolls tabindex over its own items.
                    closeOnClick keeps the menu up long enough to show the tick. */}
                  <DropdownMenuItem
                    closeOnClick={false}
                    onClick={copyWallet}
                    aria-label="Copy wallet address"
                    title={wallet}
                  >
                    {copied ? <IconCheck className="text-forest" /> : <IconCopy />}
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                      {shortAddress(wallet)}
                    </span>
                    <span className="text-[0.6875rem] text-muted-foreground">
                      {copied ? "Copied" : "Copy"}
                    </span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    render={
                      <a
                        href={`${EXPLORER}/address/${wallet}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      />
                    }
                  >
                    <IconExternalLink />
                    View on Base Sepolia
                  </DropdownMenuItem>
                </>
              ) : (
                <p className="px-1.5 py-1 text-xs text-muted-foreground">
                  No wallet yet — Privy creates one on first sign-in with an
                  embedded wallet.
                </p>
              )}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem variant="destructive" onClick={() => logout()}>
              <IconLogout />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
