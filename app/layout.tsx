import "@fontsource/manrope/400.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./globals.css";
import Link from "next/link";
import { Compass, Plane, Plus } from "lucide-react";
export const metadata = {
  title: "Pfew. — A little less planning. A little more living.",
  description: "Your personal travel companion. Organize your trip, your way.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link className="logo" href="/">
            pfew<span>.</span>
          </Link>
          <nav>
            <Link href="/">
              <Compass size={18} /> My trips
            </Link>
            <Link className="nav-add" href="/trips/new">
              <Plus size={18} /> New trip
            </Link>
          </nav>
          <span className="header-note">
            <Plane size={17} /> Less fuss. More adventure.
          </span>
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
