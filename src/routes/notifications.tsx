import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth, useUserRecords } from "@/lib/storage";
import { useNotifications, markAllRead, getReadIds, type NotifTone } from "@/lib/notifications";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — PREZNT" },
      { name: "description", content: "Session alerts, low-attendance warnings and request updates in PREZNT." },
      { property: "og:title", content: "Notifications — PREZNT" },
      { property: "og:description", content: "Session alerts, low-attendance warnings and request updates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

const toneClass: Record<NotifTone, string> = {
  info: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-amber/15 text-amber",
  danger: "bg-destructive/15 text-destructive",
};

function NotificationsPage() {
  const { currentUser, loading } = useAuth();
  const { records } = useUserRecords(currentUser?.uuid);
  const { items } = useNotifications(currentUser ?? null, records);

  const read = new Set(getReadIds());

  useEffect(() => {
    if (items.length) markAllRead(items.map((i) => i.id));
  }, [items]);

  if (loading || !currentUser) return null;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6">
      <div className="label-eyebrow">Alerts</div>
      <h1 className="mt-1 text-3xl font-semibold">Notifications</h1>

      {items.length === 0 ? (
        <div className="glass-card mt-6 grid place-items-center rounded-3xl py-16 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-card/60">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-base font-semibold">You're all caught up</div>
          <p className="mt-1 text-sm text-muted-foreground">Alerts appear here when a session opens or attendance dips.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-2.5">
          {items.map((n, i) => {
            const body = (
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${toneClass[n.tone]}`}>
                  <Bell className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{n.title}</span>
                    {!read.has(n.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {new Date(n.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
            return (
              <motion.div key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}
                className="glass-card rounded-2xl p-4">
                {n.to ? <Link to={n.to} search={n.to === "/scan" ? { subject: undefined } : undefined}>{body}</Link> : body}
              </motion.div>
            );
          })}
          <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
            <CheckCheck className="h-3.5 w-3.5" /> Marked as read
          </div>
        </div>
      )}
    </div>
  );
}
