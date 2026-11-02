"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { logout } from "../app/actions";
import type { AccountProfile } from "../lib/account-profile";
export function AccountAvatar({
  profile,
  large = false,
}: {
  profile: AccountProfile;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const size = large ? 80 : 40;
  return (
    <span
      className={"account-avatar" + (large ? " account-avatar-large" : "")}
      aria-hidden="true"
    >
      {profile.avatarUrl && !failed ? (
        <Image
          key={profile.avatarUrl}
          src={profile.avatarUrl}
          alt=""
          width={size}
          height={size}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        profile.initials
      )}
    </span>
  );
}
function SignOutSubmit({ menu = false }: { menu?: boolean }) {
  const { pending } = useFormStatus();
  const button = (
    <button
      type="submit"
      disabled={pending}
      className={menu ? "account-menu-item" : "button primary"}
    >
      <LogOut size={18} />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
  return menu ? (
    <DropdownMenu.Item
      asChild
      disabled={pending}
      onSelect={(e) => e.preventDefault()}
    >
      {button}
    </DropdownMenu.Item>
  ) : (
    button
  );
}
export function SignOutForm({ menu = false }: { menu?: boolean }) {
  return (
    <form action={logout}>
      <SignOutSubmit menu={menu} />
    </form>
  );
}
export function AccountMenu({ profile }: { profile: AccountProfile | null }) {
  if (!profile)
    return (
      <div className="header-account">
        <Link className="button secondary account-sign-in" href="/login">
          Sign in
        </Link>
      </div>
    );
  return (
    <div className="header-account">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className="account-trigger"
          aria-label={"Open account menu for " + profile.name}
        >
          <AccountAvatar key={profile.avatarUrl} profile={profile} />
          <span className="account-trigger-name">{profile.name}</span>
          <ChevronDown size={15} className="account-chevron" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="account-menu"
            align="end"
            sideOffset={10}
            collisionPadding={16}
          >
            <DropdownMenu.Label className="account-menu-identity">
              <span className="account-provider">Signed in with Google</span>
              <strong>{profile.name}</strong>
              {profile.email && (
                <span className="account-email">{profile.email}</span>
              )}
            </DropdownMenu.Label>
            <DropdownMenu.Separator className="account-menu-separator" />
            <DropdownMenu.Item asChild>
              <Link className="account-menu-item" href="/profile">
                <UserRound size={18} />
                Your account
              </Link>
            </DropdownMenu.Item>
            <SignOutForm menu />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
