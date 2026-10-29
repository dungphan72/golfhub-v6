"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

export type ProfileFormState = {
  error?: string;
};

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  city: z.string().trim().max(100),
});

export async function updateProfileAction(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const input = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    city: formData.get("city"),
  });
  if (!input.success) {
    return { error: "Vui lòng nhập họ tên hợp lệ." };
  }

  const { supabase, user } = await requireCurrentUser();
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: input.data.fullName, city: input.data.city || null })
    .eq("user_id", user.id)
    .select("user_id")
    .maybeSingle();

  if (error) {
    console.error("Could not update user profile", { code: error.code });
    return { error: "Không thể lưu hồ sơ. Vui lòng thử lại." };
  }
  if (!data) {
    return { error: "Không tìm thấy hồ sơ để cập nhật. Hãy thử đăng nhập lại." };
  }

  redirect("/app/profile?saved=1");
}
