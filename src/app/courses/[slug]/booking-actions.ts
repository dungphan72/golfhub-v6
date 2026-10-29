"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

export type BookingFormState = {
  error?: string;
};

const bookingSchema = z.object({
  teeTimeId: z.string().uuid(),
  playerCount: z.coerce.number().int().min(1).max(8),
  idempotencyKey: z.string().uuid(),
  courseSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export async function createBookingAction(
  _state: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const input = bookingSchema.safeParse({
    teeTimeId: formData.get("teeTimeId"),
    playerCount: formData.get("playerCount"),
    idempotencyKey: formData.get("idempotencyKey"),
    courseSlug: formData.get("courseSlug"),
  });
  if (!input.success) {
    return { error: "Thông tin giữ chỗ không hợp lệ. Hãy tải lại trang và thử lại." };
  }

  const { supabase } = await requireCurrentUser(`/courses/${input.data.courseSlug}`);
  const { data, error } = await supabase.rpc("create_booking", {
    requested_tee_time_id: input.data.teeTimeId,
    requested_player_count: input.data.playerCount,
    requested_idempotency_key: input.data.idempotencyKey,
  });

  if (error) {
    console.error("Booking request failed", { code: error.code });
    if (error.message.includes("TEE_TIME_FULL")) {
      return { error: "Khung giờ này vừa hết chỗ. Vui lòng chọn giờ khác." };
    }
    if (error.message.includes("TEE_TIME_UNAVAILABLE")) {
      return { error: "Khung giờ không còn khả dụng. Hãy tải lại trang." };
    }
    if (error.message.includes("IDEMPOTENCY_KEY_REUSED")) {
      return {
        error: "Yêu cầu giữ chỗ đã thay đổi. Hãy tải lại trang và gửi lại thông tin.",
      };
    }
    return { error: "Không thể giữ chỗ lúc này. Vui lòng thử lại." };
  }

  const bookingId = z.string().uuid().safeParse(data);
  if (!bookingId.success) {
    console.error("Booking RPC returned an invalid result");
    return { error: "Không nhận được xác nhận giữ chỗ. Vui lòng kiểm tra lịch đặt." };
  }

  redirect(`/app/bookings?created=${bookingId.data}`);
}
