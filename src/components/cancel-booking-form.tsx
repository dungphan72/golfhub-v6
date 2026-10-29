"use client";

import { useActionState } from "react";
import type { CancelBookingState } from "@/app/app/bookings/actions";

type CancelAction = (
  state: CancelBookingState,
  formData: FormData,
) => Promise<CancelBookingState>;

export function CancelBookingForm({
  action,
  bookingId,
}: {
  action: CancelAction;
  bookingId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="cancel-booking-form">
      <input name="bookingId" type="hidden" value={bookingId} />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button button-secondary" disabled={pending}>
        {pending ? "Đang hủy..." : "Hủy giữ chỗ"}
      </button>
    </form>
  );
}
