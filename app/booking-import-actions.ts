"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import { bookingSchema } from "../lib/essentials";
import { bookingLocationValues } from "../lib/automatic-zones";
import { validationMessage } from "../lib/domain";
export async function saveReviewedBooking(form: FormData) {
  const { db } = await access();
  const metadata = z
    .object({
      import_key: z.uuid(),
      import_method: z.enum(["text", "ai"]),
      review_confirmed: z.literal("yes"),
    })
    .safeParse(Object.fromEntries(form));
  if (!metadata.success)
    redirect(
      "/error?message=Review%20the%20imported%20fields%20before%20saving.",
    );
  let values: Record<string, unknown>;
  try {
    values = await bookingLocationValues(db, form);
  } catch (error) {
    redirect("/error?message=" + encodeURIComponent(validationMessage(error)));
  }
  const booking = bookingSchema.safeParse({
    ...values,
    verification: "user confirmed",
  });
  if (!booking.success)
    redirect(
      "/error?message=" + encodeURIComponent(validationMessage(booking.error)),
    );
  const { error } = await db.rpc("save_reviewed_booking", {
    target: booking.data.trip_id,
    import_id: metadata.data.import_key,
    method: metadata.data.import_method,
    approved: true,
    booking_data: booking.data,
  });
  if (error)
    redirect(
      "/error?message=Could%20not%20save%20the%20reviewed%20booking.%20Apply%20migration%20009%20and%20check%20dates%20and%20editing%20access.",
    );
  revalidatePath("/");
  revalidatePath("/trips/" + booking.data.trip_id);
  redirect("/trips/" + booking.data.trip_id + "?view=bookings");
}
