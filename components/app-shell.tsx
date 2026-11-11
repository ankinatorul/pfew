"use client";
import {
  useCallback,
  useMemo,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AccountProfile } from "../lib/account-profile";
import type { TripCard } from "../lib/trip-collection";
import {
  isWorkspacePath,
  resolveActiveTrip,
  routeTripId,
  tripSwitchHref,
} from "../lib/app-navigation";
import {
  readActiveTrip,
  forgetActiveTrip,
  rememberActiveTrip,
  subscribeActiveTrip,
} from "../lib/active-trip-store";
import { AccountMenu } from "./account-menu";
import { AppShellView } from "./app-shell-view";
import { PublicShell } from "./public-shell";

const serverSnapshot = () => null;
export function AppShell({
  children,
  userId,
  profile,
  trips: allTrips,
  unavailable,
  fallbackId,
}: {
  children: ReactNode;
  userId: string;
  profile: AccountProfile;
  trips: TripCard[];
  unavailable: boolean;
  fallbackId: string | null;
}) {
  const trips = useMemo(() => allTrips.filter(trip => trip.creation_state !== "draft"), [allTrips]);
  const pathname = usePathname(),
    query = useSearchParams(),
    router = useRouter();
  const snapshot = useCallback(() => readActiveTrip(userId), [userId]);
  const savedId = useSyncExternalStore(
    subscribeActiveTrip,
    snapshot,
    serverSnapshot,
  );
  const featuredId = query.get("trip"),
    view = query.get("view") || "hub",
    day = query.get("day");
  const activeTrip = resolveActiveTrip(
    trips,
    pathname,
    featuredId,
    savedId,
    fallbackId,
  );
  const workspace = isWorkspacePath(pathname);
  useEffect(() => {
    // Reconcile only against a successful fresh list, after leaving a trip route.
    if (!workspace || unavailable || routeTripId(pathname) || !savedId ||
        trips.some((trip) => trip.id === savedId)) return;
    if (activeTrip) rememberActiveTrip(userId, activeTrip.id);
    else forgetActiveTrip(userId);
  }, [workspace, unavailable, pathname, savedId, trips, activeTrip, userId]);
  useEffect(() => {
    if (!workspace) return;
    const explicitId =
      routeTripId(pathname) || (pathname === "/" ? featuredId : null);
    if (explicitId && trips.some((trip) => trip.id === explicitId))
      rememberActiveTrip(userId, explicitId);
  }, [workspace, pathname, featuredId, trips, userId]);
  useEffect(() => {
    // Keep the unchanged server-rendered Home content in sync with the saved selection.
    if (
      pathname === "/" &&
      !featuredId &&
      savedId &&
      savedId !== fallbackId &&
      trips.some((trip) => trip.id === savedId)
    )
      router.replace("/?trip=" + encodeURIComponent(savedId), {
        scroll: false,
      });
  }, [pathname, featuredId, savedId, fallbackId, trips, router]);
  if (!workspace)
    return <PublicShell profile={profile}>{children}</PublicShell>;
  return (
    <AppShellView
      trips={trips}
      activeTrip={activeTrip}
      unavailable={unavailable}
      pathname={pathname}
      view={view}
      day={day}
      LinkComponent={Link}
      accountMenu={<AccountMenu profile={profile} />}
      onTripChange={(id) => {
        const trip = trips.find((candidate) => candidate.id === id);
        if (!trip) return;
        rememberActiveTrip(userId, trip.id);
        router.push(tripSwitchHref(trip, pathname, view, day));
      }}
    >
      {children}
    </AppShellView>
  );
}
