"use client";

import { useActionState } from "react";
import type { ProfileFormState } from "@/app/app/profile/actions";

type ProfileAction = (
  state: ProfileFormState,
  formData: FormData,
) => Promise<ProfileFormState>;

export function ProfileForm({
  action,
  fullName,
  city,
  saved,
}: {
  action: ProfileAction;
  fullName: string;
  city: string;
  saved: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="profile-form">
      {saved && <p className="form-notice" role="status">Hồ sơ đã được cập nhật.</p>}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <label>
        Họ và tên
        <input
          autoComplete="name"
          defaultValue={fullName}
          maxLength={160}
          name="fullName"
          required
        />
      </label>
      <label>
        Thành phố
        <input
          autoComplete="address-level2"
          defaultValue={city}
          maxLength={100}
          name="city"
        />
      </label>
      <button className="button button-primary" disabled={pending}>
        {pending ? "Đang lưu..." : "Lưu hồ sơ"}
      </button>
    </form>
  );
}
