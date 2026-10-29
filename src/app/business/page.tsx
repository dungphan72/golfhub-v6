import Link from "next/link";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

export const instant = false;

const membershipsSchema = z.array(
  z.object({
    partner_id: z.string().uuid(),
    role: z.string(),
    organization: z.object({
      name: z.string(),
      verification_status: z.string(),
    }).nullable(),
  }),
);

export default async function BusinessDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const [{ supabase, user }, params] = await Promise.all([
    requireCurrentUser("/business"),
    searchParams,
  ]);
  const { data, error } = await supabase
    .from("partner_members")
    .select("partner_id, role, organization:partner_organizations!partner_members_partner_id_fkey(name, verification_status)")
    .eq("user_id", user.id);

  if (error) {
    console.error("Could not load partner organizations", { code: error.code });
    throw new Error("Không thể tải khu vực đối tác.");
  }
  const memberships = membershipsSchema.safeParse(data);
  if (!memberships.success) {
    console.error("Partner membership query returned an invalid shape");
    throw new Error("Dữ liệu đối tác không hợp lệ.");
  }

  return (
    <section className="dashboard-content">
      <p className="eyebrow">GOLF HUB BUSINESS</p>
      <h1>Khu vực đối tác</h1>
      {params.submitted === "1" && (
        <p className="form-notice booking-notice" role="status">
          Đã gửi hồ sơ. Đội ngũ quản trị sẽ xét duyệt trước khi cấp quyền đối tác.
        </p>
      )}
      {memberships.data.length === 0 ? (
        <section className="empty-state application-status">
          <h2>Chưa có doanh nghiệp được liên kết</h2>
          <p>
            Gửi hồ sơ để đội ngũ Golf Hub xác minh doanh nghiệp và thiết lập
            quyền quản lý.
          </p>
          <Link className="button button-primary" href="/business/apply">
            Gửi hồ sơ đối tác <span aria-hidden="true">↗</span>
          </Link>
        </section>
      ) : (
        <div className="dashboard-cards">
          {memberships.data.map((membership) => {
            const organization = membership.organization;
            return (
              <article className="dashboard-card" key={membership.partner_id}>
                <span className="pillar-number">{membership.role.toUpperCase()}</span>
                <h2>{organization?.name ?? "Doanh nghiệp"}</h2>
                <p>
                  Trạng thái:{" "}
                  {organization?.verification_status === "verified"
                    ? "Đã xác minh"
                    : "Đang chờ xác minh"}
                </p>
                {organization?.verification_status === "verified" && (
                  <>
                    <Link className="text-link" href="/business/courses">
                      Quản lý sân và khung giờ →
                    </Link>
                    <Link className="text-link" href="/business/reports">
                      Xem báo cáo đặt sân →
                    </Link>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
