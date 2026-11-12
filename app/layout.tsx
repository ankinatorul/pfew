import "@fontsource/manrope/400.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./globals.css";
import "./home.css";
import "./trip-overview.css";
import "./create-trip.css";
import "./itinerary.css";
import "./booking-budget.css";
import "./packing-documents.css";
import { PWARegister } from "../components/pwa-register";
import { Suspense } from "react";
import { AppShell } from "../components/app-shell";
import { PublicShell } from "../components/public-shell";
import { shellTrips } from "../lib/shell-data";
import { defaultActiveTrip } from "../lib/app-navigation";
import { currentGoogleUser } from "../lib/auth-session";
import { accountProfile } from "../lib/account-profile";
export const metadata = {
  manifest: "/manifest.webmanifest",
  title: "Pfew. — A little less planning. A little more living.",
  description: "Your personal travel companion. Organize your trip, your way.",
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentGoogleUser();
  const profile = user ? accountProfile(user) : null;
  const navigation = user ? await shellTrips(user.id) : null;
  return (
    <html lang="en">
      <body>
        <PWARegister />
        {user && profile && navigation ? (
          <Suspense
            fallback={
              <div className="app-shell-loading" role="status">
                Opening your travel space…
              </div>
            }
          >
            <AppShell
              userId={user.id}
              profile={profile}
              {...navigation}
              fallbackId={defaultActiveTrip(navigation.trips)?.id || null}
            >
              {children}
            </AppShell>
          </Suspense>
        ) : (
          <PublicShell profile={null}>{children}</PublicShell>
        )}
      </body>
    </html>
  );
}
