import { redirect } from "next/navigation";
import { supabase, configured } from "./supabase";
export async function access() {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  return { db, user };
}
