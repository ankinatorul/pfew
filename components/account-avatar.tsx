"use client";
import { useState } from "react";
import Image from "next/image";
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
