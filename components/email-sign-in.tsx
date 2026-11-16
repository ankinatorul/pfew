"use client";
import { useActionState } from "react";
import { requestEmailLink } from "../app/email-auth-actions";
export function EmailSignIn({ returnTo }: { returnTo?: string | null }) {
  const [state, action, pending] = useActionState(requestEmailLink, {});
  return (
    <form action={action} className="email-sign-in">
      <label>
        Email address
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={pending}
        />
      </label>
      <input type="hidden" name="next" value={returnTo || ""} />
      <button className="button" disabled={pending}>
        {pending ? "Requesting…" : "Email me a sign-in link"}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
