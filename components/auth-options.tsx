import Link from "next/link";
import { google } from "../app/actions";
import type { AuthProviders } from "../lib/auth-providers";
export function AuthOptions({
  providers,
  returnTo,
}: {
  providers: AuthProviders;
  returnTo?: string | null;
}) {
  return (
    <div className="form">
      <form action={google}>
        <input type="hidden" name="next" value={returnTo || ""} />
        <button className="button primary w-full" disabled={!providers.google}>
          Continue with Google
        </button>
      </form>
      {providers.state === "ready" && !providers.google && (
        <p role="status" className="muted">
          Google sign-in isn’t enabled yet. The project owner needs to enable
          Google authentication before you can continue.
        </p>
      )}
      {providers.state === "unavailable" && (
        <p role="status">
          We couldn’t check Google sign-in availability. Please try again in a
          moment.
        </p>
      )}
      {!providers.google && (
        <Link href="/login" className="button secondary">
          Try again
        </Link>
      )}
    </div>
  );
}
