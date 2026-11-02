import { currentGoogleUser } from "./auth-session";
import { redirect } from "next/navigation";
import { supabase, configured } from "./supabase";
export async function access() {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const user = await currentGoogleUser();
  if (!user) redirect("/login");
  return { db, user };
}
