import "@fontsource/manrope/400.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./globals.css";
import { PWARegister } from "../components/pwa-register";
import Link from "next/link";
import { AccountMenu } from "../components/account-menu";
import { currentGoogleUser } from "../lib/auth-session";
import { accountProfile } from "../lib/account-profile";
import { Compass, Plus } from "lucide-react";
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
  return (
    <html lang="en">
      <body>
        <PWARegister />
        <header>
          <Link className="logo" href="/">
            pfew<span>.</span>
          </Link>
          <nav>
            <Link href="/">
              <Compass size={18} /> My trips
            </Link>
            <Link className="nav-add" href="/trips/new" aria-label="New trip">
              <Plus size={18} /> <span className="nav-add-label">New trip</span>
            </Link>
          </nav>
          <AccountMenu profile={profile} />
        </header>
        <main>{children}</main>
        <footer>
          <strong>pfew.</strong>
          <span>A little less planning. A little more living.</span>
          <Link href="/profile">Your account</Link>
        </footer>
      </body>
    </html>
  );
}
