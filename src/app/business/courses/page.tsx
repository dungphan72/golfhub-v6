import { z } from "zod";
import { CreateCourseForm, CreateTeeTimeForm } from "@/components/partner-course-forms";
import {
  createCourseAction,
  createTeeTimeAction,
} from "@/app/business/courses/actions";
import { requireCurrentUser } from "@/lib/auth";

export const instant = false;

const membershipSchema = z.array(
  z.object({
    partner_id: z.string().uuid(),
    role: z.string(),
    organization: z.object({
      name: z.string(),
      verification_status: z.string(),
    }).nullable(),
  }),
);
const courseSchema = z.array(
  z.object({
    id: z.string().uuid(),
    partner_id: z.string().uuid(),
    name: z.string(),
    city: z.string(),
    province: z.string(),
    address: z.string(),
    verification_status: z.string(),
    is_published: z.boolean(),
  }),
);
const teeTimeSchema = z.array(
  z.object({
    id: z.string().uuid(),
    course_id: z.string().uuid(),
    starts_at: z.string(),
    capacity: z.number(),
    price_per_player_minor: z.union([z.number(), z.string()]),
  }),
);

export default async function PartnerCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; slotAdded?: string }>;
}) {
  const [{ supabase, user }, params] = await Promise.all([
    requireCurrentUser("/business/courses"),
    searchParams,
  ]);
  const { data: membershipRows, error: membershipError } = await supabase
    .from("partner_members")
    .select("partner_id, role, organization:partner_organizations!partner_members_partner_id_fkey(name, verification_status)")
    .eq("user_id", user.id);
  if (membershipError) {
    console.error("Could not load partner permissions", { code: membershipError.code });
    throw new Error("Không thể tải quyền quản lý đối tác.");
  }

  const memberships = membershipSchema.safeParse(membershipRows);
  if (!memberships.success) {
    console.error("Partner permissions returned an invalid shape");
    throw new Error("Dữ liệu quyền đối tác không hợp lệ.");
  }

  const verifiedPartnerIds = memberships.data
    .filter((membership) => membership.organization?.verification_status === "verified")
    .map((membership) => membership.partner_id);

  const { data: courseRows, error: courseError } = verifiedPartnerIds.length
    ? await supabase
        .from("golf_courses")
        .select("id, partner_id, name, city, province, address, verification_status, is_published")
        .in("partner_id", memberships.data.map((membership) => membership.partner_id))
        .order("name")
    : { data: [], error: null };
  if (courseError) {
    console.error("Could not load partner courses", { code: courseError.code });
    throw new Error("Không thể tải danh sách sân.");
  }

  const courses = courseSchema.safeParse(courseRows);
  if (!courses.success) {
    console.error("Partner course query returned an invalid shape");
    throw new Error("Dữ liệu sân golf không hợp lệ.");
  }

  const { data: teeTimeRows, error: teeTimeError } = courses.data.length
    ? await supabase
        .from("tee_times")
        .select("id, course_id, starts_at, capacity, price_per_player_minor")
        .in("course_id", courses.data.map((course) => course.id))
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
    : { data: [], error: null };
  if (teeTimeError) {
    console.error("Could not load partner availability", { code: teeTimeError.code });
    throw new Error("Không thể tải khung giờ.");
  }

  const teeTimes = teeTimeSchema.safeParse(teeTimeRows);
  if (!teeTimes.success) {
    console.error("Partner availability query returned an invalid shape");
    throw new Error("Dữ liệu khung giờ không hợp lệ.");
  }

  return (
    <section className="dashboard-content">
      <p className="eyebrow">QUẢN LÝ CƠ SỞ</p>
      <h1>Sân và khung giờ</h1>
      <p className="subpage-intro">
        Dữ liệu sân mới phải được xác minh trước khi hiển thị; khung giờ chỉ
        được mở cho sân đã công khai.
      </p>
      {params.submitted === "1" && (
        <p className="form-notice booking-notice" role="status">Đã gửi sân để xét duyệt.</p>
      )}
      {params.slotAdded === "1" && (
        <p className="form-notice booking-notice" role="status">Đã thêm khung giờ.</p>
      )}
      {verifiedPartnerIds.length === 0 ? (
        <section className="empty-state application-status">
          <h2>Chưa có doanh nghiệp được xác minh</h2>
          <p>Hồ sơ đối tác phải được quản trị viên duyệt trước khi quản lý cơ sở.</p>
        </section>
      ) : (
        <>
          {memberships.data
            .filter((membership) => verifiedPartnerIds.includes(membership.partner_id))
            .map((membership) => (
              <CreateCourseForm
                action={createCourseAction}
                key={membership.partner_id}
                partnerId={membership.partner_id}
              />
            ))}
          <div className="partner-course-list">
            {courses.data.map((course) => (
              <article className="partner-course-card" key={course.id}>
                <div>
                  <span className={`booking-status booking-status-${course.verification_status}`}>
                    {course.verification_status === "verified" ? "Đã xác minh" : "Chờ xác minh"}
                  </span>
                  <h2>{course.name}</h2>
                  <p>{course.city}, {course.province} · {course.address}</p>
                </div>
                {course.verification_status === "verified" && (
                  <CreateTeeTimeForm action={createTeeTimeAction} courseId={course.id} />
                )}
                {teeTimes.data
                  .filter((teeTime) => teeTime.course_id === course.id)
                  .map((teeTime) => (
                    <p className="partner-tee-time" key={teeTime.id}>
                      {new Intl.DateTimeFormat("vi-VN", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "Asia/Ho_Chi_Minh",
                      }).format(new Date(teeTime.starts_at))} · {teeTime.capacity} chỗ
                    </p>
                  ))}
              </article>
            ))}
            {courses.data.length === 0 && (
              <section className="empty-state">
                <h2>Chưa có sân được gửi</h2>
                <p>Thêm thông tin sân để gửi quản trị viên xác minh.</p>
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}
