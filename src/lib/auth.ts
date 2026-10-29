import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSupabaseEnvironment } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireCurrentUser(returnTo = "/app") {
  if (!getSupabaseEnvironment().configured) {
    redirect("/login?error=configuration");
  }

  await connection();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Could not verify the current user", { code: error.code });
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }
  if (!data.user) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }

  return { supabase, user: data.user };
}
