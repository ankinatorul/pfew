import type { ReactNode } from "react";
import Link from "next/link";
import { Compass, Plus } from "lucide-react";
import { AccountMenu } from "./account-menu";
import type { AccountProfile } from "../lib/account-profile";

export function PublicShell({
  children,
  profile,
}: {
  children: ReactNode;
  profile: AccountProfile | null;
}) {
  return (
    <>
      <header className="public-header">
        <Link className="logo" href="/">
          pfew<span>.</span>
        </Link>
        <nav className="public-nav" aria-label="Public navigation">
          <Link href="/trips">
            <Compass size={18} /> My trips
          </Link>
          <Link className="nav-add" href="/trips/new" aria-label="New trip">
            <Plus size={18} />
            <span className="nav-add-label">New trip</span>
          </Link>
        </nav>
        <AccountMenu profile={profile} />
      </header>
      <main className="public-main">{children}</main>
      <footer className="public-footer">
        <strong>pfew.</strong>
        <span>A little less planning. A little more living.</span>
        <Link href="/profile">Your account</Link>
      </footer>
    </>
  );
}
