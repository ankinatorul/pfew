export const dynamic = "force-dynamic";
import { access } from "../../lib/access";
import { accountProfile } from "../../lib/account-profile";
import { AccountAvatar, SignOutForm } from "../../components/account-menu";
export default async function Profile() {
  const { user } = await access();
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
          Trips are private to your account. Signing out of Pfew keeps your
          saved trips and leaves your Google account signed in.
        </p>
        <SignOutForm />
      </section>
    </>
  );
}
