export const dynamic = "force-dynamic";
import { access } from "../../../lib/access";
import { TripOnboarding } from "../../../components/onboarding/onboarding";
export default async function New() {
  const { db } = await access();
  const { error } = await db.from("trip_onboarding").select("trip_id").limit(0);
  return (
    <TripOnboarding
      schemaReady={!error}
      live={process.env.AI_MODE === "live" && !!process.env.AI_API_KEY}
    />
  );
}
