import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { useViewAs } from "@/contexts/ViewAsContext";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard, LogOut, PanelLeft, Building2, Wrench,
  ClipboardList, MapPin, Settings, Briefcase,
  UserCircle, Shield, HardHat, ChevronDown, ArrowLeft,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

type MenuItem = { icon: React.ComponentType<{ className?: string }>; label: string; path: string };
type MenuSection = { title: string; items: MenuItem[] };

const adminSections: MenuSection[] = [
  {
    title: "Platform Admin",
    items: [
      { icon: Shield, label: "Overview", path: "/admin" },
      { icon: Building2, label: "Companies", path: "/admin/companies" },
    ],
  },
];

const companySections: MenuSection[] = [
  {
    title: "Company",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/company" },
      { icon: ClipboardList, label: "Jobs", path: "/company/jobs" },
      { icon: MapPin, label: "Properties", path: "/company/properties" },
      { icon: HardHat, label: "Contractors", path: "/company/contractors" },
      { icon: Settings, label: "Settings", path: "/company/settings" },
    ],
  },
];

const contractorSections: MenuSection[] = [
  {
    title: "Contractor",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/contractor" },
      { icon: Briefcase, label: "Job Board", path: "/contractor/jobs" },
      { icon: Wrench, label: "My Jobs", path: "/contractor/my-jobs" },
      { icon: UserCircle, label: "Profile", path: "/contractor/profile" },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    window.location.href = "/signin";
    return <DashboardLayoutSkeleton />;
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (w: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const viewAs = useViewAs();
  const isAdmin = user?.role === "admin";

  // When admin is impersonating, show ONLY the impersonated role's sections
  // When not impersonating, show the user's own sections
  const isImpersonating = isAdmin && viewAs.mode !== "admin";

  const sections = useMemo(() => {
    if (isImpersonating) {
      // Full impersonation: show ONLY the target role's sidebar, no admin sections
      if (viewAs.mode === "company") return companySections;
      if (viewAs.mode === "contractor") return contractorSections;
    }
    if (isAdmin) return adminSections;
    if (user?.role === "contractor") return contractorSections;
    return companySections;
  }, [user?.role, isAdmin, isImpersonating, viewAs.mode]);

  // Display name and role label for the sidebar footer
  const displayName = useMemo(() => {
    if (isImpersonating) {
      if (viewAs.mode === "company") return viewAs.companyName ?? "Company";
      if (viewAs.mode === "contractor") return viewAs.contractorName ?? "Contractor";
    }
    return user?.name || "-";
  }, [isImpersonating, viewAs, user?.name]);

  const displayRole = useMemo(() => {
    if (isImpersonating) return viewAs.mode;
    return user?.role ?? "user";
  }, [isImpersonating, viewAs.mode, user?.role]);

  const allItems = sections.flatMap(s => s.items);
  const activeMenuItem = allItems.find(item => item.path === location)
    ?? allItems.filter(item => location.startsWith(item.path)).sort((a, b) => b.path.length - a.path.length)[0];

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button onClick={toggleSidebar} className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors shrink-0" aria-label="Toggle navigation">
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <Wrench className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-semibold tracking-tight truncate text-foreground">Maintenance Mgr</span>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            {sections.map((section, sIdx) => (
              <div key={section.title}>
                {sIdx > 0 && <Separator className="my-2 mx-2" />}
                {!isCollapsed && (
                  <div className="px-4 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {section.title}
                    </span>
                  </div>
                )}
                <SidebarMenu className="px-2 py-0.5">
                  {section.items.map(item => {
                    const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path + "/"));
                    return (
                      <SidebarMenuItem key={`${section.title}-${item.path}`}>
                        <SidebarMenuButton isActive={isActive} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-9 transition-all font-normal">
                          <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                      {displayName?.charAt(0).toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5 capitalize">{displayRole}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {!isImpersonating && (
                  <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /><span>Sign out</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {/* Impersonation banner — only shown when admin is impersonating */}
        {isImpersonating && <ImpersonationBanner />}

        {/* Admin selector banner — only shown when admin is NOT impersonating */}
        {isAdmin && !isImpersonating && <AdminSelectorBanner />}

        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <span className="tracking-tight text-foreground">{activeMenuItem?.label ?? "Menu"}</span>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}

/** Thin banner shown when admin is impersonating — the ONLY indicator of impersonation */
function ImpersonationBanner() {
  const viewAs = useViewAs();
  const [, setLocation] = useLocation();

  const label = viewAs.mode === "company"
    ? `Logged in as Company: ${viewAs.companyName}`
    : `Logged in as Contractor: ${viewAs.contractorName}`;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-4 sticky top-0 z-50">
      <div className="flex items-center gap-2 text-sm text-amber-400">
        <Shield className="h-4 w-4 shrink-0" />
        <span className="font-medium">Admin Impersonation:</span>
        <span>{label}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 shrink-0"
        onClick={() => {
          viewAs.resetViewAs();
          setLocation("/admin");
        }}
      >
        <ArrowLeft className="h-3 w-3" />
        Exit to Admin
      </Button>
    </div>
  );
}

/** Banner shown on admin's own view (not impersonating) — lets admin pick who to impersonate */
function AdminSelectorBanner() {
  const viewAs = useViewAs();
  const [, setLocation] = useLocation();

  const { data: companies } = trpc.company.listAll.useQuery();
  const { data: contractors } = trpc.adminViewAs.allContractors.useQuery();

  return (
    <div className="bg-primary/5 border-b border-primary/20 px-4 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Shield className="h-4 w-4" />
          <span>Admin View</span>
        </div>

        {/* Login as Company */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 h-8 text-xs border-border">
              <Building2 className="h-3.5 w-3.5" />
              Login as Company
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
            {companies && companies.length > 0 ? (
              companies.map((c: any) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => {
                    viewAs.setViewAsCompany(c.id, c.name);
                    setLocation("/company");
                  }}
                  className="cursor-pointer"
                >
                  <Building2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  {c.name}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>No companies registered yet</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Login as Contractor */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 h-8 text-xs border-border">
              <HardHat className="h-3.5 w-3.5" />
              Login as Contractor
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
            {contractors && contractors.length > 0 ? (
              contractors.map((c: any) => (
                <DropdownMenuItem
                  key={c.profile.id}
                  onClick={() => {
                    viewAs.setViewAsContractor(c.profile.id, c.user.name || c.profile.businessName || `Contractor #${c.profile.id}`);
                    setLocation("/contractor");
                  }}
                  className="cursor-pointer"
                >
                  <HardHat className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  {c.user.name || c.profile.businessName || `Contractor #${c.profile.id}`}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>No contractors registered yet</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
