export const dynamic = "force-dynamic";
import { access } from "../../lib/access";
import { logout } from "../actions";
export default async function Profile() {
  const { user } = await access();
  return (
    <>
      <span className="eyebrow">Your travel space</span>
      <h1>Hello, traveler.</h1>
      <section className="card">
        <h2>Your account</h2>
        <p>{user.email}</p>
        <p className="muted">
          Trips are private to your account. Signing out keeps saved trip
          information in Supabase.
        </p>
        <form action={logout}>
          <button className="button primary">Sign out</button>
        </form>
      </section>
    </>
  );
}
