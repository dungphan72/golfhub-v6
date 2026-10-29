import "server-only";

import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

const bookingSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "pending_payment",
    "confirmed",
    "cancelled",
    "expired",
    "completed",
    "payment_failed",
  ]),
  player_count: z.number().int().positive(),
  amount_minor: z.union([z.number(), z.string().regex(/^\d+$/)])
    .transform(Number)
    .pipe(z.number().int().nonnegative().safe()),
  currency: z.literal("VND"),
  expires_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  tee_time: z.object({
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    course: z.object({
      name: z.string(),
      slug: z.string(),
      city: z.string(),
    }),
  }),
});

const paymentTransactionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "creating",
    "pending",
    "uncertain",
    "paid",
    "late_paid",
    "review_required",
    "creation_failed",
    "cancelled",
  ]),
  checkout_url: z.string().url().nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export type Booking = z.infer<typeof bookingSchema>;

export async function getMyBookings() {
  const { supabase, user } = await requireCurrentUser("/app/bookings");
  const { error: expirationError } = await supabase.rpc(
    "expire_my_pending_bookings",
  );
  if (expirationError) {
    console.error("Could not expire the golfer's timed-out holds", {
      code: expirationError.code,
    });
    return { status: "error" as const };
  }

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, player_count, amount_minor, currency, expires_at, created_at, tee_time:tee_times!bookings_tee_time_id_fkey(starts_at, ends_at, course:golf_courses!tee_times_course_id_fkey(name, slug, city))",
    )
    .eq("golfer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Could not load golfer bookings", { code: error.code });
    return { status: "error" as const };
  }

  const parsed = z.array(bookingSchema).safeParse(data);
  if (!parsed.success) {
    console.error("Booking query returned data with an invalid shape");
    return { status: "error" as const };
  }

  return { status: "ok" as const, bookings: parsed.data };
}

export async function getMyBooking(bookingId: string) {
  const { supabase, user } = await requireCurrentUser(`/app/bookings/${bookingId}`);
  const { error: expirationError } = await supabase.rpc(
    "expire_my_pending_bookings",
  );
  if (expirationError) {
    console.error("Could not expire the golfer's timed-out holds", {
      code: expirationError.code,
    });
    return { status: "error" as const };
  }

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, player_count, amount_minor, currency, expires_at, created_at, tee_time:tee_times!bookings_tee_time_id_fkey(starts_at, ends_at, course:golf_courses!tee_times_course_id_fkey(name, slug, city))",
    )
    .eq("id", bookingId)
    .eq("golfer_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Could not load booking details", { code: error.code });
    return { status: "error" as const };
  }
  if (!data) {
    return { status: "not_found" as const };
  }
  const parsedBooking = bookingSchema.safeParse(data);
  if (!parsedBooking.success) {
    console.error("Booking detail query returned an invalid shape");
    return { status: "error" as const };
  }

  const { data: historyRows, error: historyError } = await supabase
    .from("booking_status_history")
    .select("old_status, new_status, created_at")
    .eq("booking_id", bookingId)
    .order("created_at");
  if (historyError) {
    console.error("Could not load booking status history", { code: historyError.code });
    return { status: "error" as const };
  }
  const history = z.array(z.object({
    old_status: z.string().nullable(),
    new_status: z.string(),
    created_at: z.string(),
  })).safeParse(historyRows);
  if (!history.success) {
    console.error("Booking history query returned an invalid shape");
    return { status: "error" as const };
  }

  const { data: paymentRows, error: paymentError } = await supabase
    .from("payment_transactions")
    .select("id, status, checkout_url, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (paymentError) {
    console.error("Could not load booking payment state", { code: paymentError.code });
    return { status: "error" as const };
  }
  const payments = z.array(paymentTransactionSchema).safeParse(paymentRows);
  if (!payments.success) {
    console.error("Booking payment query returned an invalid shape");
    return { status: "error" as const };
  }

  return {
    status: "ok" as const,
    booking: parsedBooking.data,
    history: history.data,
    payment: payments.data[0] ?? null,
  };
}
