"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

export type CancelBookingState = {
  error?: string;
};

export async function cancelBookingAction(
  _state: CancelBookingState,
  formData: FormData,
): Promise<CancelBookingState> {
  const bookingId = z.string().uuid().safeParse(formData.get("bookingId"));
  if (!bookingId.success) {
    return { error: "Mã đặt sân không hợp lệ." };
  }

  const { supabase } = await requireCurrentUser("/app/bookings");
  const { error } = await supabase.rpc("cancel_booking", {
    requested_booking_id: bookingId.data,
  });
  if (error) {
    console.error("Booking cancellation failed", { code: error.code });
    if (error.message.includes("CANCELLATION_WINDOW_CLOSED")) {
      return { error: "Không thể hủy trong vòng 24 giờ trước giờ chơi." };
    }
    return { error: "Không thể hủy lượt đặt này. Vui lòng tải lại và thử lại." };
  }

  redirect("/app/bookings?cancelled=1");
}
