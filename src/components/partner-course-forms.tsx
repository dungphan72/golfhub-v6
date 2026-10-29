"use client";

import { useActionState } from "react";
import type { PartnerActionState } from "@/app/business/courses/actions";

type PartnerAction = (
  state: PartnerActionState,
  formData: FormData,
) => Promise<PartnerActionState>;

export function CreateCourseForm({
  action,
  partnerId,
}: {
  action: PartnerAction;
  partnerId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="profile-form partner-course-form">
      <input name="partnerId" type="hidden" value={partnerId} />
      <h2>Gửi thông tin sân</h2>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <label>Tên sân<input maxLength={160} name="name" required /></label>
      <label>Thành phố<input maxLength={100} name="city" required /></label>
      <label>Tỉnh / thành<input maxLength={100} name="province" required /></label>
      <label>Địa chỉ<input maxLength={240} name="address" required /></label>
      <label>
        Mô tả
        <textarea maxLength={2000} name="description" rows={4} />
      </label>
      <p className="field-hint">
        Sân mới ở trạng thái chờ xác minh và chưa hiển thị công khai.
      </p>
      <button className="button button-primary" disabled={pending}>
        {pending ? "Đang gửi..." : "Gửi sân để xác minh"}
      </button>
    </form>
  );
}

export function CreateTeeTimeForm({
  action,
  courseId,
}: {
  action: PartnerAction;
  courseId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <details className="tee-time-editor">
      <summary>Thêm khung giờ</summary>
      <form action={formAction} className="tee-time-editor-form">
        <input name="courseId" type="hidden" value={courseId} />
        {state.error && <p className="form-error" role="alert">{state.error}</p>}
        <label>Giờ bắt đầu (giờ Việt Nam)<input name="startsAt" required type="datetime-local" /></label>
        <label>Giờ kết thúc<input name="endsAt" required type="datetime-local" /></label>
        <label>Giá / người (VND)<input min="0" max="1000000000000" name="price" required type="number" /></label>
        <label>Sức chứa<input defaultValue="4" max="8" min="1" name="capacity" required type="number" /></label>
        <button className="button button-primary" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu khung giờ"}
        </button>
      </form>
    </details>
  );
}

export function DeactivateTeeTimeForm({
  action,
  teeTimeId,
}: {
  action: PartnerAction;
  teeTimeId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="tee-time-editor-form">
      <input name="teeTimeId" type="hidden" value={teeTimeId} />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button button-secondary" disabled={pending}>
        {pending ? "Đang đóng..." : "Đóng khung giờ"}
      </button>
    </form>
  );
}
