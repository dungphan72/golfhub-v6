"use client";

import { useActionState } from "react";
import type { PayosCheckoutState } from "@/app/app/bookings/payos-actions";

type CheckoutAction = (
  state: PayosCheckoutState,
  formData: FormData,
) => Promise<PayosCheckoutState>;

export function PayosCheckoutForm({
  action,
  bookingId,
}: {
  action: CheckoutAction;
  bookingId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="booking-form">
      <input name="bookingId" type="hidden" value={bookingId} />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button button-primary" disabled={pending}>
        {pending ? "Đang kết nối PayOS..." : "Thanh toán qua PayOS"}
      </button>
    </form>
  );
}
