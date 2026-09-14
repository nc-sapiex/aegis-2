"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { filterNavByRoles } from "@/lib/nav-items";
import { type Role, getRoleDisplayName } from "@/lib/permissions";
import { ChevronsUpDown, LogOut } from "@/lib/icons";
import { handleSignOut } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AppSidebarProps {
  /** User's roles for filtering navigation items */
  roles?: Role[];
  /** User's name for display in sidebar footer */
  userName?: string;
  /** User's email for display in sidebar footer */
  userEmail?: string;
  /** User's initials for avatar */
  userInitials?: string;
}

function SidebarLogo() {
  const { state } = useSidebar();
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <Image
        src="/logos/aegis-mark.png"
        alt="AEGIS"
        width={36}
        height={36}
        className="h-9 w-9 shrink-0"
        priority
      />
      {state === "expanded" && (
        <div className="flex flex-col">
          <span className="text-sidebar-foreground text-sm font-bold tracking-wide">
            AEGIS
          </span>
          <span className="text-sidebar-foreground/60 text-[10px] tracking-wider">
            SAPIEX TECHNOLOGIES
          </span>
        </div>
      )}
    </Link>
  );
}

export function AppSidebar({
  roles = [],
  userName = "User",
  userEmail = "user@example.com",
  userInitials = "U",
}: AppSidebarProps) {
  const pathname = usePathname();

  // Filter nav items based on user's roles
  const visibleNavItems = filterNavByRoles(roles);

  // Display role badges (comma-separated if multiple roles)
  const roleBadges = roles.map((role) => getRoleDisplayName(role)).join(", ");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <SidebarLogo />
      </SidebarHeader>

      <SidebarContent>
        {visibleNavItems.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNavItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(item.href + "/"));
                  const label = item.title;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={label}
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          // No permissions - show empty state
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="text-sidebar-foreground/60 px-4 py-2 text-sm">
                No permissions assigned. Please contact administrator.
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{userName}</span>
                    <span className="text-sidebar-foreground/60 truncate text-xs">
                      {roleBadges}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                side="top"
                align="start"
                sideOffset={4}
              >
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid text-sm leading-tight">
                    <span className="font-semibold">{userName}</span>
                    <span className="text-muted-foreground text-xs">
                      {userEmail}
                    </span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
