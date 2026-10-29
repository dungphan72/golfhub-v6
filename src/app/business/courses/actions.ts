"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

export type PartnerActionState = { error?: string };

const courseSchema = z.object({
  partnerId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(240),
  description: z.string().trim().max(2000),
});

const courseDetailsSchema = courseSchema.omit({ partnerId: true });

function createSlug(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  return `${slug || "golf-course"}-${randomUUID().slice(0, 8)}`;
}

export async function createCourseAction(
  _state: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const input = courseSchema.safeParse({
    partnerId: formData.get("partnerId"),
    name: formData.get("name"),
    city: formData.get("city"),
    province: formData.get("province"),
    address: formData.get("address"),
    description: formData.get("description"),
  });
  if (!input.success) {
    return { error: "Vui lòng kiểm tra các thông tin sân golf." };
  }

  const { supabase } = await requireCurrentUser("/business/courses");
  const { error } = await supabase.from("golf_courses").insert({
    partner_id: input.data.partnerId,
    name: input.data.name,
    slug: createSlug(input.data.name),
    city: input.data.city,
    province: input.data.province,
    address: input.data.address,
    description: input.data.description,
    verification_status: "pending",
    is_published: false,
  });

  if (error) {
    console.error("Partner course submission failed", { code: error.code });
    if (error.code === "42501") {
      return { error: "Bạn không có quyền thêm sân cho doanh nghiệp này." };
    }
    return { error: "Không thể gửi thông tin sân. Vui lòng thử lại." };
  }

  redirect("/business/courses?submitted=1");
}

export async function updatePendingCourseAction(
  _state: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const input = z.object({
    courseId: z.string().uuid(),
    ...courseDetailsSchema.shape,
  }).safeParse({
    courseId: formData.get("courseId"),
    name: formData.get("name"),
    city: formData.get("city"),
    province: formData.get("province"),
    address: formData.get("address"),
    description: formData.get("description"),
  });
  if (!input.success) {
    return { error: "Vui lòng kiểm tra các thông tin sân golf." };
  }

  const { supabase } = await requireCurrentUser("/business/courses");
  const { data, error } = await supabase
    .from("golf_courses")
    .update({
      name: input.data.name,
      city: input.data.city,
      province: input.data.province,
      address: input.data.address,
      description: input.data.description,
    })
    .eq("id", input.data.courseId)
    .eq("verification_status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Pending course update failed", { code: error.code });
    if (error.code === "42501") {
      return { error: "Bạn không có quyền cập nhật hồ sơ sân này." };
    }
    return { error: "Không thể cập nhật hồ sơ sân. Vui lòng thử lại." };
  }
  if (!data) {
    return { error: "Chỉ có thể cập nhật sân đang chờ xét duyệt." };
  }

  redirect("/business/courses?courseUpdated=1");
}

const teeTimeSchema = z.object({
  courseId: z.string().uuid(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  price: z.coerce.number().int().min(0).max(1_000_000_000_000),
  capacity: z.coerce.number().int().min(1).max(8),
});

function parseVietnamDateTime(value: string) {
  const timestamp = Date.parse(`${value}:00+07:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export async function createTeeTimeAction(
  _state: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const input = teeTimeSchema.safeParse({
    courseId: formData.get("courseId"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    price: formData.get("price"),
    capacity: formData.get("capacity"),
  });
  if (!input.success) {
    return { error: "Vui lòng kiểm tra ngày giờ, giá và sức chứa." };
  }

  const startsAt = parseVietnamDateTime(input.data.startsAt);
  const endsAt = parseVietnamDateTime(input.data.endsAt);
  const now = Date.now();
  if (
    startsAt === null ||
    endsAt === null ||
    startsAt <= now + 15 * 60 * 1000 ||
    startsAt > now + 90 * 24 * 60 * 60 * 1000 ||
    endsAt <= startsAt ||
    endsAt - startsAt > 12 * 60 * 60 * 1000
  ) {
    return { error: "Khung giờ phải bắt đầu sau 15 phút và trong vòng 90 ngày." };
  }

  const { supabase } = await requireCurrentUser("/business/courses");
  const { error } = await supabase.from("tee_times").insert({
    course_id: input.data.courseId,
    starts_at: new Date(startsAt).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    price_per_player_minor: input.data.price,
    currency: "VND",
    capacity: input.data.capacity,
    is_active: true,
  });

  if (error) {
    console.error("Partner tee-time submission failed", { code: error.code });
    if (error.code === "23505") {
      return { error: "Sân đã có khung giờ này. Vui lòng chọn giờ khác." };
    }
    if (error.code === "42501") {
      return { error: "Bạn không có quyền quản lý khung giờ của sân này." };
    }
    return { error: "Không thể lưu khung giờ. Vui lòng thử lại." };
  }

  redirect("/business/courses?slotAdded=1");
}

export async function deactivateTeeTimeAction(
  _state: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const input = z.object({
    teeTimeId: z.string().uuid(),
  }).safeParse({
    teeTimeId: formData.get("teeTimeId"),
  });
  if (!input.success) {
    return { error: "Khung giờ không hợp lệ." };
  }

  const { supabase } = await requireCurrentUser("/business/courses");
  const { data, error } = await supabase.rpc("deactivate_partner_tee_time", {
    requested_tee_time_id: input.data.teeTimeId,
  });
  if (error) {
    console.error("Partner tee-time closure failed", { code: error.code });
    if (error.code === "42501") {
      return { error: "Bạn không có quyền quản lý khung giờ này." };
    }
    if (error.code === "P0001" && error.message.includes("TEE_TIME_HAS_ACTIVE_BOOKINGS")) {
      return { error: "Không thể đóng: khung giờ đang có lượt giữ chỗ hoặc đã xác nhận." };
    }
    if (error.code === "P0001" && error.message.includes("TEE_TIME_ALREADY_STARTED")) {
      return { error: "Không thể đóng khung giờ đã bắt đầu." };
    }
    return { error: "Không thể đóng khung giờ. Vui lòng tải lại và thử lại." };
  }

  const result = z.enum(["deactivated", "already_inactive"]).safeParse(data);
  if (!result.success) {
    console.error("Tee-time closure returned an invalid state");
    return { error: "Kết quả đóng khung giờ không hợp lệ. Vui lòng tải lại trang." };
  }

  redirect("/business/courses?slotClosed=1");
}
