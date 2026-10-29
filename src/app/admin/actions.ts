"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin";

export type AdminActionState = { error?: string };

export async function reviewPartnerApplicationAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const input = z.object({
    applicationId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    slug: z.string().trim().max(160),
  }).safeParse({
    applicationId: formData.get("applicationId"),
    decision: formData.get("decision"),
    slug: formData.get("slug"),
  });
  if (!input.success) {
    return { error: "Thông tin xét duyệt không hợp lệ." };
  }

  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("review_partner_application", {
    requested_application_id: input.data.applicationId,
    requested_decision: input.data.decision,
    requested_slug: input.data.slug,
  });
  if (error) {
    console.error("Partner application review failed", { code: error.code });
    if (error.code === "42501" && error.message.includes("PARTNER_APPLICATION_SELF_REVIEW_NOT_ALLOWED")) {
      return { error: "Bạn không thể tự xét duyệt hồ sơ đối tác của mình." };
    }
    if (error.code === "23505") {
      return { error: "Đường dẫn đối tác đã được sử dụng." };
    }
    return { error: "Không thể duyệt hồ sơ. Hãy tải lại và thử lại." };
  }

  redirect("/admin?reviewed=1");
}

export async function reviewCourseAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const input = z.object({
    courseId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
  }).safeParse({
    courseId: formData.get("courseId"),
    decision: formData.get("decision"),
  });
  if (!input.success) {
    return { error: "Thông tin xét duyệt sân không hợp lệ." };
  }

  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("review_golf_course", {
    requested_course_id: input.data.courseId,
    requested_decision: input.data.decision,
  });
  if (error) {
    console.error("Course review failed", { code: error.code });
    return { error: "Không thể duyệt sân. Hãy tải lại và thử lại." };
  }

  redirect("/admin?reviewed=1");
}
