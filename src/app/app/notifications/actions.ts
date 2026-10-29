"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

export async function markNotificationReadAction(formData: FormData) {
  const notificationId = z.string().uuid().safeParse(formData.get("notificationId"));
  if (!notificationId.success) {
    throw new Error("Mã thông báo không hợp lệ.");
  }

  const { supabase, user } = await requireCurrentUser("/app/notifications");
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId.data)
    .eq("recipient_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Could not mark notification as read", { code: error.code });
    throw new Error("Không thể cập nhật thông báo.");
  }
  if (!data) {
    throw new Error("Không tìm thấy thông báo của tài khoản này.");
  }

  redirect("/app/notifications");
}
