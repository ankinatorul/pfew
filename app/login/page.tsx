export const dynamic = "force-dynamic";
import { configured } from "../../lib/supabase";
import Link from "next/link";
import { login, google } from "../actions";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  if (!configured())
    return (
      <section className="hero">
        <h1>Let’s get connected.</h1>
        <p>
          Supabase authentication needs configuration before you can sign in.
        </p>
        <Link className="button primary" href="/setup">
          View setup instructions
        </Link>
      </section>
    );
  const { sent } = await searchParams;
  return (
    <section className="setup">
      <span className="eyebrow">Welcome to Pfew.</span>
      <h1>
        Good things
        <br />
        are going places.
      </h1>
      <p>Your plans, together. Sign in to your private travel space.</p>
      {sent && (
        <p role="status" className="card lime">
          Check your email for a sign-in link. You can close this tab.
        </p>
      )}
      <div className="form">
        <form action={google}>
          <button className="button secondary w-full">
            Continue with Google
          </button>
        </form>
        <p className="muted">Or use a secure email link. No password needed.</p>
        <form action={login}>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          <button className="button primary">Email me a sign-in link</button>
        </form>
      </div>
    </section>
  );
}
