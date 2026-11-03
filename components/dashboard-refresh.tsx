"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useOnline } from "./essentials/online";
import { Button } from "./button";
export function DashboardRefresh() {
  const router = useRouter(),
    [pending, start] = useTransition(),
    online = useOnline();
  return (
    <div>
      <Button
        variant="secondary"
        disabled={pending || !online}
        onClick={() => start(() => router.refresh())}
      >
        {pending ? "Refreshing…" : "Refresh dashboard"}
      </Button>
      {!online && (
        <p className="muted" role="status">
          Reconnect to refresh saved plans.
        </p>
      )}
    </div>
  );
}
