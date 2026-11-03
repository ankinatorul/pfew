export const dynamic = "force-dynamic";
import Link from "next/link";
import { RemoveAttachment } from "../../components/essentials/attachment-form";
import { access } from "../../lib/access";
import { accountProfile } from "../../lib/account-profile";
import { AccountAvatar, SignOutForm } from "../../components/account-menu";
export default async function Profile() {
  const { user, db } = await access();
  const { data: files } = await db
    .from("booking_attachments")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  const profile = accountProfile(user);
  return (
    <>
      <span className="eyebrow">Your travel space</span>
      <h1>Hello, {profile.name.split(/\s+/)[0]}.</h1>
      <section className="card profile-card">
        <div className="profile-identity">
          <AccountAvatar profile={profile} large />
          <div>
            <span className="pill">Signed in with Google</span>
            <h2>{profile.name}</h2>
            {profile.email && <p>{profile.email}</p>}
          </div>
        </div>
        <p className="muted">
          Trips stay private until you invite someone. Signing out of Pfew keeps
          your saved trips and leaves your Google account signed in.
        </p>
        <div className="actions">
          <Link className="button secondary" href="/profile/checks">
            Check app setup ↗
          </Link>
          <SignOutForm />
        </div>
      </section>
      <section className="card">
        <h2>Your private documents</h2>
        <p className="muted">
          Only you can download these files, including after you leave a shared
          trip. Remove them here when you no longer need them. Previously
          downloaded copies must be removed separately.
        </p>
        {!files?.length && <p>No private uploads.</p>}
        {files?.map((file) => (
          <div className="attachment-row" key={file.id}>
            {file.state === "pending" ? (
              <p>Incomplete upload: {file.filename}</p>
            ) : (
              <a
                className="button secondary"
                href={"/api/attachments/" + file.id}
              >
                Download {file.filename}
              </a>
            )}
            <RemoveAttachment trip={file.trip_id} id={file.id} />
          </div>
        ))}
        <a className="button secondary" href="/offline.html">
          Manage offline downloads
        </a>
      </section>
    </>
  );
}
