import { PartnerApplicationForm } from "@/components/partner-application-form";
import { submitPartnerApplicationAction } from "@/app/business/apply/actions";
import { requireCurrentUser } from "@/lib/auth";

export const instant = false;

export default async function BusinessApplicationPage() {
  const { supabase, user } = await requireCurrentUser("/business/apply");
  const { data, error } = await supabase
    .from("partner_applications")
    .select("id, business_name, status, created_at")
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not load partner application status", { code: error.code });
    throw new Error("Không thể tải trạng thái hồ sơ đối tác.");
  }

  return (
    <section className="dashboard-content">
      <p className="eyebrow">ĐỐI TÁC GOLF HUB</p>
      <h1>Hồ sơ đối tác</h1>
      <p className="subpage-intro">
        Thông tin do bạn gửi sẽ được quản trị viên xem xét trước khi cấp quyền
        quản lý dữ liệu doanh nghiệp.
      </p>
      {data?.status === "pending" ? (
        <section className="empty-state application-status">
          <h2>Hồ sơ đang chờ xét duyệt</h2>
          <p>{data.business_name} · gửi ngày {new Date(data.created_at).toLocaleDateString("vi-VN")}</p>
        </section>
      ) : data?.status === "approved" ? (
        <section className="empty-state application-status">
          <h2>Hồ sơ đã được duyệt</h2>
          <p>Bạn có thể gửi sân và khung giờ từ khu vực quản lý đối tác.</p>
        </section>
      ) : (
        <PartnerApplicationForm action={submitPartnerApplicationAction} />
      )}
    </section>
  );
}
