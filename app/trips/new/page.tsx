export const dynamic = "force-dynamic";
import { access } from "../../../lib/access";
import { TripForm } from "../../../components/forms";
export default async function New() {
  await access();
  return (
    <>
      <span className="eyebrow">Something to look forward to</span>
      <h1>Let’s get you going.</h1>
      <p>A few essentials now. All the possibilities later.</p>
      <TripForm />
    </>
  );
}
