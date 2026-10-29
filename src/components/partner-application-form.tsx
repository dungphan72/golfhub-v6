"use client";

import { useActionState } from "react";
import type { PartnerApplicationState } from "@/app/business/apply/actions";

type SubmitAction = (
  state: PartnerApplicationState,
  formData: FormData,
) => Promise<PartnerApplicationState>;

export function PartnerApplicationForm({ action }: { action: SubmitAction }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="profile-form partner-application-form">
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <label>
        Tên doanh nghiệp
        <input autoComplete="organization" maxLength={160} name="businessName" required />
      </label>
      <label>
        Loại hình
        <select defaultValue="course" name="partnerType">
          <option value="course">Sân golf</option>
          <option value="range">Sân tập</option>
          <option value="simulator">Golf trong nhà / mô phỏng</option>
          <option value="academy">Học viện / huấn luyện viên</option>
          <option value="club">Câu lạc bộ</option>
          <option value="retailer">Cửa hàng thiết bị</option>
          <option value="other">Dịch vụ golf khác</option>
        </select>
      </label>
      <label>
        Người liên hệ
        <input autoComplete="name" maxLength={160} name="contactName" required />
      </label>
      <label>
        Email liên hệ
        <input autoComplete="email" maxLength={254} name="contactEmail" required type="email" />
      </label>
      <label>
        Số điện thoại
        <input autoComplete="tel" maxLength={32} name="contactPhone" required type="tel" />
      </label>
      <label>
        Thành phố
        <input autoComplete="address-level2" maxLength={100} name="city" required />
      </label>
      <button className="button button-primary" disabled={pending}>
        {pending ? "Đang gửi..." : "Gửi hồ sơ xét duyệt"}
      </button>
    </form>
  );
}
