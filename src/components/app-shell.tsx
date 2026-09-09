import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Home, ScanFace, ClipboardList, Settings as SettingsIcon, Users, Bell, BarChart3 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth, useTheme, getSeenSplash, markSeenSplash, hasFaceEnrolled, useUserRecords } from "@/lib/storage";
import { useNotifications } from "@/lib/notifications";
import { Splash } from "@/components/splash";

const studentNav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/scan", label: "Mark", icon: ScanFace },
  { to: "/records", label: "Records", icon: ClipboardList },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

const profNav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/scan", label: "Class", icon: Users },
  { to: "/records", label: "Records", icon: ClipboardList },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

const PUBLIC_ROUTES = ["/auth"];
const ENROLL_ROUTE = "/enroll";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { currentUser, loading } = useAuth();
  useTheme();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    if (!getSeenSplash()) {
      setShowSplash(true);
      const t = setTimeout(() => { markSeenSplash(); setShowSplash(false); }, 2000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (!mounted || showSplash) return;
    if (loading) return; // wait for auth resolution before deciding redirects
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (!currentUser && !isPublic) {
      navigate({ to: "/auth" });
      return;
    }
    if (currentUser && isPublic) {
      navigate({ to: "/" });
      return;
    }
    // Student first-time enrollment (only if never enrolled)
    if (currentUser && currentUser.role === "Student" && !hasFaceEnrolled(currentUser.uuid) && pathname !== ENROLL_ROUTE) {
      navigate({ to: ENROLL_ROUTE });
    }
  }, [currentUser, pathname, navigate, showSplash, mounted, loading]);

  const showChrome = mounted && !!currentUser && !PUBLIC_ROUTES.includes(pathname) && pathname !== ENROLL_ROUTE;
  const nav = currentUser?.role === "Professor" ? profNav : studentNav;

  return (
    <>
      <AnimatePresence>{showSplash && <Splash key="splash" />}</AnimatePresence>

      <div className="relative z-10 flex min-h-screen w-full flex-col">
        {showChrome && <TopBar />}
        <main className={`flex-1 ${showChrome ? "pb-[110px]" : ""}`}>
          {children}
        </main>
        {showChrome && <BottomNav pathname={pathname} nav={nav} />}
      </div>
    </>
  );
}

function TopBar() {
  const { currentUser } = useAuth();
  const { records } = useUserRecords(currentUser?.uuid);
  const { unread } = useNotifications(currentUser ?? null, records);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/70 px-5 py-3.5 backdrop-blur-xl">
      <Link to="/" className="flex items-center gap-2">
        <Wordmark className="text-lg" />
      </Link>
      <div className="flex items-center gap-2">
        {currentUser?.role === "Professor" && (
          <Link to="/analytics" title="Analytics" aria-label="Analytics"
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-card hover:text-foreground">
            <BarChart3 className="h-[18px] w-[18px]" />
          </Link>
        )}
        <Link to="/notifications" title="Notifications" aria-label="Notifications"
          className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-card hover:text-foreground">
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
        <Link to="/settings" className="group">
          <Avatar name={currentUser?.name ?? "?"} size={36} />
        </Link>
      </div>
    </header>
  );
}

function BottomNav({ pathname, nav }: { pathname: string; nav: ReadonlyArray<{ to: string; label: string; icon: any }> }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="relative grid grid-cols-4 gap-1 rounded-2xl border border-border/60 bg-card/85 p-1.5 backdrop-blur-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`relative flex flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-medium transition ${
                active ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 rounded-xl bg-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <motion.div animate={active ? { y: -2 } : { y: 0 }} className="relative">
                <Icon className="h-[18px] w-[18px]" />
              </motion.div>
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-[-0.04em] ${className}`} style={{ letterSpacing: "-0.04em" }}>
      PREZNT
    </span>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="grid place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/30"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}
