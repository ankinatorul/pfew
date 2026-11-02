export const dynamic = "force-dynamic";
import { safeReturnPath } from "../../lib/auth-redirect";
import { redirect } from "next/navigation";
import { currentGoogleUser } from "../../lib/auth-session";
import { configured } from "../../lib/supabase";
import Link from "next/link";
import { authProviders } from "../../lib/auth-providers";
import { AuthOptions } from "../../components/auth-options";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const returnTo = safeReturnPath(next);
  if (await currentGoogleUser()) redirect(returnTo || "/");
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
  const providers = await authProviders();
  return (
    <section className="setup">
      <span className="eyebrow">Welcome to Pfew.</span>
      <h1>
        Good things
        <br />
        are going places.
      </h1>
      <p>Your plans, together. Sign in to your private travel space.</p>
      <AuthOptions providers={providers} returnTo={returnTo} />
    </section>
  );
}
