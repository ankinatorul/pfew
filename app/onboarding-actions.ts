"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import { bookingSchema } from "../lib/essentials";
import { bookingLocationValues } from "../lib/automatic-zones";
export async function completeOnboardingDraft(form: FormData) {
  const { db } = await access();
  const metadata = z
    .object({
      trip_id: z.uuid(),
      onboarding_draft_id: z.uuid(),
      onboarding_review: z.literal("yes"),
    })
    .safeParse(Object.fromEntries(form));
  if (!metadata.success)
    redirect("/error?message=Review%20the%20draft%20before%20saving.");
  if (
    (form.get("local_time") && !form.get("location_id")) ||
    (form.get("end_local_time") &&
      form.get("category") !== "accommodation" &&
      !form.get("end_location_id"))
  )
    redirect(
      "/error?message=Choose%20the%20booking%20cities%20for%20the%20saved%20clock%20times.",
    );
  let approved;
  try {
    approved = bookingSchema.parse(await bookingLocationValues(db, form));
  } catch {
    redirect(
      "/error?message=Check%20the%20booking%20fields%20and%20selected%20cities.",
    );
  }
  const { data, error } = await db.rpc("complete_onboarding_draft", {
    target: metadata.data.trip_id,
    draft_key: metadata.data.onboarding_draft_id,
    booking_data: approved,
  });
  if (error)
    redirect(
      "/error?message=The%20private%20draft%20could%20not%20be%20saved.",
    );
  revalidatePath("/trips/" + metadata.data.trip_id);
  redirect("/trips/" + metadata.data.trip_id + "?view=bookings&edit=" + data);
}
