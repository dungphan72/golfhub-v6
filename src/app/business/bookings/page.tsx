import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

export const instant = false;

const membershipsSchema = z.array(z.object({ partner_id: z.string().uuid() }));
const coursesSchema = z.array(z.object({ id: z.string().uuid() }));
const teeTimesSchema = z.array(z.object({ id: z.string().uuid() }));
const bookingsSchema = z.array(z.object({
  id: z.string().uuid(),
  status: z.string(),
  player_count: z.number().int(),
  amount_minor: z.union([z.number(), z.string()]),
  created_at: z.string(),
  tee_time: z.object({
    starts_at: z.string(),
    course: z.object({ name: z.string(), city: z.string() }),
  }),
}));

export default async function PartnerBookingsPage() {
  const { supabase, user } = await requireCurrentUser("/business/bookings");
  const { data: membershipRows, error: membershipError } = await supabase
    .from("partner_members")
    .select("partner_id")
    .eq("user_id", user.id);
  if (membershipError) {
    console.error("Could not load partner booking access", { code: membershipError.code });
    throw new Error("Không thể tải đặt sân của đối tác.");
  }
  const memberships = membershipsSchema.safeParse(membershipRows);
  if (!memberships.success) {
    console.error("Partner booking access query returned an invalid shape");
    throw new Error("Dữ liệu quyền đối tác không hợp lệ.");
  }

  const partnerIds = memberships.data.map((membership) => membership.partner_id);
  const { data: courseRows, error: courseError } = partnerIds.length
    ? await supabase.from("golf_courses").select("id").in("partner_id", partnerIds)
    : { data: [], error: null };
  if (courseError) {
    console.error("Could not load partner course booking scope", { code: courseError.code });
    throw new Error("Không thể tải sân của đối tác.");
  }
  const courses = coursesSchema.safeParse(courseRows);
  if (!courses.success) {
    console.error("Partner course scope returned an invalid shape");
    throw new Error("Dữ liệu sân golf không hợp lệ.");
  }

  const { data: teeTimeRows, error: teeTimeError } = courses.data.length
    ? await supabase.from("tee_times").select("id").in(
        "course_id",
        courses.data.map((course) => course.id),
      )
    : { data: [], error: null };
  if (teeTimeError) {
    console.error("Could not load partner tee-time booking scope", { code: teeTimeError.code });
    throw new Error("Không thể tải khung giờ của đối tác.");
  }
  const teeTimes = teeTimesSchema.safeParse(teeTimeRows);
  if (!teeTimes.success) {
    console.error("Partner tee-time scope returned an invalid shape");
    throw new Error("Dữ liệu khung giờ không hợp lệ.");
  }

  const teeTimeIds = teeTimes.data.map((teeTime) => teeTime.id);
  const { data: bookingRows, error: bookingError } = teeTimeIds.length
    ? await supabase
        .from("bookings")
        .select("id, status, player_count, amount_minor, created_at, tee_time:tee_times!bookings_tee_time_id_fkey(starts_at, course:golf_courses!tee_times_course_id_fkey(name, city))")
        .in("tee_time_id", teeTimeIds)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  if (bookingError) {
    console.error("Could not load partner bookings", { code: bookingError.code });
    throw new Error("Không thể tải danh sách đặt sân.");
  }
  const bookings = bookingsSchema.safeParse(bookingRows);
  if (!bookings.success) {
    console.error("Partner booking query returned an invalid shape");
    throw new Error("Dữ liệu đặt sân không hợp lệ.");
  }

  return (
    <section className="dashboard-content">
      <p className="eyebrow">VẬN HÀNH ĐỐI TÁC</p>
      <h1>Đặt sân tại cơ sở</h1>
      <p className="subpage-intro">
        Chỉ lượt đặt thuộc các cơ sở bạn được phân quyền mới được hiển thị.
      </p>
      {bookings.data.length === 0 ? (
        <section className="empty-state booking-empty">
          <h2>Chưa có lượt đặt sân</h2>
          <p>Đặt chỗ mới sẽ xuất hiện khi golfer giữ một khung giờ.</p>
        </section>
      ) : (
        <div className="booking-list">
          {bookings.data.map((booking) => (
            <article className="booking-card" key={booking.id}>
              <div className="booking-card-heading">
                <div>
                  <p className="eyebrow">{booking.tee_time.course.city}</p>
                  <h2>{booking.tee_time.course.name}</h2>
                </div>
                <span className="booking-status">{booking.status}</span>
              </div>
              <p className="booking-date">
                {new Intl.DateTimeFormat("vi-VN", {
                  dateStyle: "full",
                  timeStyle: "short",
                  timeZone: "Asia/Ho_Chi_Minh",
                }).format(new Date(booking.tee_time.starts_at))}
              </p>
              <p className="booking-meta">
                {booking.player_count} người · {Number(booking.amount_minor).toLocaleString("vi-VN")} VND
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
