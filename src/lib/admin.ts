import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

export async function requirePlatformAdmin(returnTo = "/admin") {
  const { supabase, user } = await requireCurrentUser(returnTo);
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["ADMIN", "SUPER_ADMIN"]);

  if (error) {
    console.error("Could not verify platform administrator role", { code: error.code });
    throw new Error("Không thể xác minh quyền quản trị.");
  }

  const roles = z.array(z.object({ role: z.string() })).safeParse(data);
  if (!roles.success) {
    console.error("Administrator role query returned an invalid shape");
    throw new Error("Dữ liệu quyền quản trị không hợp lệ.");
  }
  if (roles.data.length === 0) {
    redirect("/app");
  }

  return { supabase, user };
}
