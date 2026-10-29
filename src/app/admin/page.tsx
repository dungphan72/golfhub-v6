import { z } from "zod";
import {
  ReviewCourseForm,
  ReviewPartnerForm,
} from "@/components/admin-review-forms";
import {
  reviewCourseAction,
  reviewPartnerApplicationAction,
} from "@/app/admin/actions";
import { requirePlatformAdmin } from "@/lib/admin";

export const instant = false;

const applicationsSchema = z.array(z.object({
  id: z.string().uuid(),
  applicant_id: z.string().uuid(),
  business_name: z.string(),
  partner_type: z.string(),
  contact_name: z.string(),
  contact_email: z.string(),
  contact_phone: z.string(),
  city: z.string(),
  created_at: z.string(),
}));
const coursesSchema = z.array(z.object({
  id: z.string().uuid(),
  name: z.string(),
  city: z.string(),
  province: z.string(),
  address: z.string(),
  description: z.string(),
  partner: z.object({ name: z.string() }).nullable(),
}));
const profilesSchema = z.array(z.object({
  user_id: z.string().uuid(),
  full_name: z.string(),
  city: z.string().nullable(),
  created_at: z.string(),
}));
const bookingsSchema = z.array(z.object({
  id: z.string().uuid(),
  status: z.string(),
  amount_minor: z.union([z.number(), z.string()]),
  currency: z.string(),
  created_at: z.string(),
}));
const auditSchema = z.array(z.object({
  id: z.number(),
  action: z.string(),
  entity_type: z.string(),
  created_at: z.string(),
}));

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string }>;
}) {
  const [{ supabase, user }, params] = await Promise.all([
    requirePlatformAdmin(),
    searchParams,
  ]);
  const [applicationQuery, courseQuery, profileQuery, bookingQuery, auditQuery] =
    await Promise.all([
      supabase
        .from("partner_applications")
        .select("id, applicant_id, business_name, partner_type, contact_name, contact_email, contact_phone, city, created_at")
        .eq("status", "pending")
        .order("created_at")
        .limit(50),
      supabase
        .from("golf_courses")
        .select("id, name, city, province, address, description, partner:partner_organizations!golf_courses_partner_id_fkey(name)")
        .eq("verification_status", "pending")
        .order("created_at")
        .limit(50),
      supabase
        .from("profiles")
        .select("user_id, full_name, city, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("bookings")
        .select("id, status, amount_minor, currency, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("audit_logs")
        .select("id, action, entity_type, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  const queries = [
    applicationQuery,
    courseQuery,
    profileQuery,
    bookingQuery,
    auditQuery,
  ];
  const failedQuery = queries.find((query) => query.error);
  if (failedQuery?.error) {
    console.error("Admin dashboard data load failed", { code: failedQuery.error.code });
    throw new Error("Không thể tải dữ liệu quản trị.");
  }

  const applications = applicationsSchema.safeParse(applicationQuery.data);
  const courses = coursesSchema.safeParse(courseQuery.data);
  const profiles = profilesSchema.safeParse(profileQuery.data);
  const bookings = bookingsSchema.safeParse(bookingQuery.data);
  const auditLogs = auditSchema.safeParse(auditQuery.data);
  if (
    !applications.success ||
    !courses.success ||
    !profiles.success ||
    !bookings.success ||
    !auditLogs.success
  ) {
    console.error("Admin dashboard query returned an invalid shape");
    throw new Error("Dữ liệu quản trị không hợp lệ.");
  }

  return (
    <section className="dashboard-content">
      <p className="eyebrow">GOLF HUB OS</p>
      <h1>Quản trị nền tảng</h1>
      {params.reviewed === "1" && (
        <p className="form-notice booking-notice" role="status">Đã ghi nhận kết quả xét duyệt.</p>
      )}
      <div className="admin-summary">
        <a href="#partners"><strong>{applications.data.length}</strong><span>Hồ sơ chờ duyệt</span></a>
        <a href="#courses"><strong>{courses.data.length}</strong><span>Sân chờ xác minh</span></a>
        <a href="#users"><strong>{profiles.data.length}</strong><span>Hồ sơ người dùng gần đây</span></a>
        <a href="#bookings"><strong>{bookings.data.length}</strong><span>Lượt đặt gần đây</span></a>
      </div>

      <section className="admin-section" id="partners">
        <p className="eyebrow">ĐỐI TÁC</p>
        <h2>Hồ sơ chờ xét duyệt</h2>
        {applications.data.length === 0 ? (
          <p className="empty-note">Không có hồ sơ đang chờ.</p>
        ) : applications.data.map((application) => (
          <article className="admin-card" key={application.id}>
            <h3>{application.business_name}</h3>
            <p>
              {application.partner_type} · {application.city} ·{" "}
              {application.contact_name}
            </p>
            <p>{application.contact_email} · {application.contact_phone}</p>
            {application.applicant_id === user.id ? (
              <p className="empty-note">Bạn không thể tự xét duyệt hồ sơ đối tác của mình.</p>
            ) : (
              <ReviewPartnerForm
                action={reviewPartnerApplicationAction}
                applicationId={application.id}
                defaultSlug={application.business_name
                  .normalize("NFD")
                  .replace(/\p{Diacritic}/gu, "")
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
                }
              />
            )}
          </article>
        ))}
      </section>

      <section className="admin-section" id="courses">
        <p className="eyebrow">SÂN GOLF</p>
        <h2>Sân chờ xác minh</h2>
        {courses.data.length === 0 ? (
          <p className="empty-note">Không có sân đang chờ xác minh.</p>
        ) : courses.data.map((course) => (
          <article className="admin-card" key={course.id}>
            <h3>{course.name}</h3>
            <p>{course.partner?.name ?? "Đối tác"} · {course.city}, {course.province}</p>
            <p>{course.address}</p>
            {course.description && <p>{course.description}</p>}
            <ReviewCourseForm action={reviewCourseAction} courseId={course.id} />
          </article>
        ))}
      </section>

      <section className="admin-section" id="users">
        <p className="eyebrow">NGƯỜI DÙNG</p>
        <h2>Hồ sơ golfer gần đây</h2>
        {profiles.data.map((profile) => (
          <article className="admin-row" key={profile.user_id}>
            <span>{profile.full_name || "Chưa cập nhật tên"}</span>
            <span>{profile.city ?? "Chưa cập nhật thành phố"}</span>
            <code>{profile.user_id}</code>
          </article>
        ))}
      </section>

      <section className="admin-section" id="bookings">
        <p className="eyebrow">ĐẶT SÂN</p>
        <h2>Hoạt động đặt sân gần đây</h2>
        {bookings.data.map((booking) => (
          <article className="admin-row" key={booking.id}>
            <span>{booking.status}</span>
            <span>{booking.amount_minor} {booking.currency}</span>
            <code>{booking.id}</code>
          </article>
        ))}
      </section>

      <section className="admin-section" id="audit">
        <p className="eyebrow">KIỂM TOÁN</p>
        <h2>Nhật ký quản trị</h2>
        {auditLogs.data.map((entry) => (
          <article className="admin-row" key={entry.id}>
            <span>{entry.action}</span>
            <span>{entry.entity_type}</span>
            <time>{new Date(entry.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</time>
          </article>
        ))}
      </section>
    </section>
  );
}
