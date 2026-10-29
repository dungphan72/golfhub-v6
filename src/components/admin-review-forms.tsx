"use client";

import { useActionState } from "react";
import type { AdminActionState } from "@/app/admin/actions";

type AdminAction = (
  state: AdminActionState,
  formData: FormData,
) => Promise<AdminActionState>;

export function ReviewPartnerForm({
  action,
  applicationId,
  defaultSlug,
}: {
  action: AdminAction;
  applicationId: string;
  defaultSlug: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="admin-review-form">
      <input name="applicationId" type="hidden" value={applicationId} />
      <label>
        Slug đối tác (chỉ dùng chữ thường, số và dấu gạch ngang)
        <input defaultValue={defaultSlug} maxLength={160} name="slug" />
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="admin-actions">
        <button
          className="button button-primary"
          disabled={pending}
          name="decision"
          value="approve"
        >
          Duyệt đối tác
        </button>
        <button
          className="button button-secondary"
          disabled={pending}
          name="decision"
          value="reject"
        >
          Từ chối
        </button>
      </div>
    </form>
  );
}

export function ReviewCourseForm({
  action,
  courseId,
}: {
  action: AdminAction;
  courseId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="admin-review-form">
      <input name="courseId" type="hidden" value={courseId} />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="admin-actions">
        <button
          className="button button-primary"
          disabled={pending}
          name="decision"
          value="approve"
        >
          Xác minh và công khai
        </button>
        <button
          className="button button-secondary"
          disabled={pending}
          name="decision"
          value="reject"
        >
          Từ chối
        </button>
      </div>
    </form>
  );
}
