import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Baby,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareQuote,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Workspace — JOJI" },
      {
        name: "description",
        content: "JOJI workspace: translate, campaigns and maternal health tools.",
      },
      { property: "og:title", content: "Workspace — JOJI" },
      {
        property: "og:description",
        content: "Multilingual health communication tools for your team.",
      },
    ],
  }),
  component: AppShell,
});

type NavItem = { to: string; label: string; icon: LucideIcon; hint: string };

const NAV: NavItem[] = [
  { to: "/app/translate", label: "Translate", icon: MessageSquareQuote, hint: "Live consultation" },
  { to: "/app/campaign", label: "Campaign Studio", icon: Megaphone, hint: "Multilingual kits" },
  { to: "/app/maternal", label: "Maternal Health", icon: Baby, hint: "Calculators" },
  { to: "/app/settings", label: "Settings", icon: Settings, hint: "Profile & org" },
];

function AppShell() {
  const { user, ready, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  // Route guard: unauthenticated visitors go back to /auth.
  useEffect(() => {
    if (ready && !user) navigate({ to: "/auth", replace: true });
  }, [ready, user, navigate]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!ready || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="label-mono text-muted-foreground">Loading workspace…</p>
      </div>
    );
  }

  const sidebar = (
    <div className="deep-panel flex h-full w-72 flex-col p-5">
      <div className="flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-cream/15">
            <MessageSquareQuote className="size-4.5 text-cream" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold text-cream">JOJI</p>
            <p className="label-mono text-cream/60">MedNova</p>
          </div>
        </Link>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-2 text-cream/70 hover:bg-cream/10 lg:hidden"
          aria-label="Close menu"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="mt-8 space-y-1.5">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors",
                active
                  ? "bg-cream/15 text-cream"
                  : "text-cream/70 hover:bg-cream/10 hover:text-cream",
              )}
            >
              <item.icon className="size-4.5 shrink-0" />
              <span className="leading-tight">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="label-mono text-cream/50">{item.hint}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl bg-cream/10 p-4">
        <p className="truncate text-sm font-medium text-cream">{user.fullName}</p>
        <p className="truncate text-xs text-cream/60">{user.organization || user.orgType}</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full justify-start text-cream/80 hover:bg-cream/10 hover:text-cream"
          onClick={() => {
            signOut();
            navigate({ to: "/auth" });
          }}
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 animate-rise">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 hover:bg-secondary"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <p className="font-display text-base font-semibold">JOJI</p>
        </header>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
