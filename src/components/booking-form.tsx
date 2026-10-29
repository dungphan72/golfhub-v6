"use client";

import { useActionState } from "react";
import type { BookingFormState } from "@/app/courses/[slug]/booking-actions";

type BookingAction = (
  state: BookingFormState,
  formData: FormData,
) => Promise<BookingFormState>;

export function BookingForm({
  action,
  teeTimeId,
  idempotencyKey,
  courseSlug,
  capacity,
}: {
  action: BookingAction;
  teeTimeId: string;
  idempotencyKey: string;
  courseSlug: string;
  capacity: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="booking-form">
      <input name="teeTimeId" type="hidden" value={teeTimeId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="courseSlug" type="hidden" value={courseSlug} />
      <label>
        Số người chơi
        <select defaultValue="1" name="playerCount">
          {Array.from({ length: Math.min(capacity, 8) }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>{count} người</option>
          ))}
        </select>
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button button-primary" disabled={pending}>
        {pending ? "Đang giữ chỗ..." : "Giữ chỗ 10 phút"}
      </button>
    </form>
  );
}
