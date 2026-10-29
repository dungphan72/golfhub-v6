import Link from "next/link";
import { CancelBookingForm } from "@/components/cancel-booking-form";
import { cancelBookingAction } from "@/app/app/bookings/actions";
import { getMyBookings } from "@/lib/bookings";

export const instant = false;

type BookingsPageProps = {
  searchParams: Promise<{ created?: string; cancelled?: string }>;
};

function formatVietnamDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function statusLabel(status: string) {
  switch (status) {
    case "pending_payment":
      return "Đang giữ chỗ · chưa thanh toán";
    case "confirmed":
      return "Đã xác nhận";
    case "cancelled":
      return "Đã hủy";
    case "expired":
      return "Đã hết hạn";
    case "completed":
      return "Đã hoàn thành";
    case "payment_failed":
      return "Thanh toán thất bại";
    default:
      return "Trạng thái chưa xác định";
  }
}

export default async function BookingsPage({ searchParams }: BookingsPageProps) {
  const [result, params] = await Promise.all([getMyBookings(), searchParams]);
  const created = params.created;

  return (
    <section className="dashboard-content">
      <p className="eyebrow">LỊCH CỦA BẠN</p>
      <h1>Đặt sân</h1>
      <p className="subpage-intro">
        Theo dõi các lượt giữ chỗ. Golf Hub hiện chưa xử lý thanh toán thật.
      </p>
      {created && (
        <p className="form-notice booking-notice" role="status">
          Đã tạo lượt giữ chỗ. Lượt giữ chỗ hết hạn sau 10 phút nếu chưa có
          thanh toán được cấu hình.
        </p>
      )}
      {params.cancelled === "1" && (
        <p className="form-notice booking-notice" role="status">
          Đã hủy lượt giữ chỗ.
        </p>
      )}
      {result.status === "error" ? (
        <p className="form-error" role="alert">
          Không thể tải lịch đặt sân. Vui lòng thử lại sau.
        </p>
      ) : result.bookings.length === 0 ? (
        <section className="empty-state booking-empty">
          <h2>Chưa có lượt đặt sân</h2>
          <p>Danh sách sẽ hiển thị sau khi bạn giữ chỗ một khung giờ.</p>
          <Link className="button button-primary" href="/courses">
            Khám phá sân golf <span aria-hidden="true">↗</span>
          </Link>
        </section>
      ) : (
        <div className="booking-list">
          {result.bookings.map((booking) => {
            const displayStatus = booking.status;
            const canCancel =
              booking.status === "pending_payment";

            return (
              <article className="booking-card" key={booking.id}>
                <div className="booking-card-heading">
                  <div>
                    <p className="eyebrow">{booking.tee_time.course.city}</p>
                    <h2>
                      <Link href={`/app/bookings/${booking.id}`}>
                        {booking.tee_time.course.name}
                      </Link>
                    </h2>
                  </div>
                  <span className={`booking-status booking-status-${displayStatus}`}>
                    {statusLabel(displayStatus)}
                  </span>
                </div>
                <p className="booking-date">
                  {formatVietnamDate(booking.tee_time.starts_at)}
                </p>
                <p className="booking-meta">
                  {booking.player_count} người · {formatVnd(booking.amount_minor)}
                </p>
                {canCancel && (
                  <div className="booking-card-action">
                    <p>
                      Hạn giữ chỗ:{" "}
                      {booking.expires_at
                        ? formatVietnamDate(booking.expires_at)
                        : "10 phút"}
                    </p>
                    <CancelBookingForm
                      action={cancelBookingAction}
                      bookingId={booking.id}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
