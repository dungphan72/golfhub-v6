import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelBookingForm } from "@/components/cancel-booking-form";
import { cancelBookingAction } from "@/app/app/bookings/actions";
import { createPayosCheckoutAction } from "@/app/app/bookings/payos-actions";
import { PayosCheckoutForm } from "@/components/payos-checkout-form";
import { getMyBooking } from "@/lib/bookings";

export const instant = false;

type BookingDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
};

function formatVietnamDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function formatStatus(value: string) {
  const labels: Record<string, string> = {
    pending_payment: "Đang giữ chỗ · chưa thanh toán",
    confirmed: "Đã xác nhận",
    cancelled: "Đã hủy",
    expired: "Đã hết hạn",
    completed: "Đã hoàn thành",
    payment_failed: "Thanh toán thất bại",
  };
  return labels[value] ?? "Trạng thái chưa xác định";
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: BookingDetailPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await getMyBooking(id);
  if (result.status === "not_found") {
    notFound();
  }
  if (result.status === "error") {
    throw new Error("Không thể tải thông tin lượt đặt sân.");
  }

  const { booking, history, payment } = result;
  const hasPendingHold = booking.status === "pending_payment" &&
    booking.expires_at !== null;

  return (
    <section className="dashboard-content">
      <Link className="back-link" href="/app/bookings">← Lịch đặt sân</Link>
      <p className="eyebrow">CHI TIẾT LƯỢT ĐẶT</p>
      <h1>{booking.tee_time.course.name}</h1>
      <p className="subpage-intro">{booking.tee_time.course.city}</p>
      {query.payment === "return" && (
        <p className="form-notice booking-notice" role="status">
          Đã quay lại từ PayOS. Trạng thái chỉ được xác nhận sau khi hệ thống nhận và kiểm tra webhook.
          Hãy tải lại trang sau ít phút để xem cập nhật.
        </p>
      )}
      {query.payment === "cancelled" && (
        <p className="form-notice booking-notice" role="status">
          Bạn đã quay lại từ trang thanh toán. Booking vẫn chờ thanh toán cho tới khi hết hạn hoặc được hủy.
        </p>
      )}
      <article className="booking-card booking-detail-card">
        <span className={`booking-status booking-status-${booking.status}`}>
          {formatStatus(booking.status)}
        </span>
        <p className="booking-date">
          {formatVietnamDate(booking.tee_time.starts_at)}
        </p>
        <p className="booking-meta">
          {booking.player_count} người ·{" "}
          {new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency: booking.currency,
            maximumFractionDigits: 0,
          }).format(booking.amount_minor)}
        </p>
        {booking.status === "pending_payment" && booking.expires_at && (
          <p className="booking-meta">
            Hạn giữ chỗ: {formatVietnamDate(booking.expires_at)}.
          </p>
        )}
        {booking.status === "confirmed" && payment?.status === "paid" && (
          <p className="booking-meta">Thanh toán PayOS đã được webhook xác thực.</p>
        )}
        {payment?.status === "late_paid" && (
          <p className="form-error" role="alert">
            Khoản thanh toán đến sau khi lượt giữ chỗ hết hiệu lực và cần đối soát thủ công.
            Không thực hiện thanh toán lần nữa.
          </p>
        )}
        {payment?.status === "review_required" && (
          <p className="form-error" role="alert">
            Giao dịch có khoản thanh toán bổ sung hoặc sai lệch và cần đối soát thủ công.
            Trạng thái lượt đặt: {formatStatus(booking.status)}. Vui lòng liên hệ hỗ trợ
            và không thanh toán lần nữa.
          </p>
        )}
        {hasPendingHold && payment?.status !== "uncertain" && (
          <div className="booking-card-action">
            <p>Thanh toán an toàn qua PayOS. Chỗ chỉ được xác nhận sau webhook hợp lệ.</p>
            <PayosCheckoutForm
              action={createPayosCheckoutAction}
              bookingId={booking.id}
            />
          </div>
        )}
        {payment?.status === "uncertain" && (
          <p className="form-error" role="alert">
            Yêu cầu tạo liên kết PayOS đang cần kiểm tra. Không tạo hoặc thanh toán liên kết khác;
            vui lòng liên hệ hỗ trợ.
          </p>
        )}
        {booking.status === "pending_payment" && (
          <div className="booking-card-action">
            <p>Hủy giữ chỗ sẽ giải phóng số chỗ này.</p>
            <CancelBookingForm action={cancelBookingAction} bookingId={booking.id} />
          </div>
        )}
      </article>
      <section className="admin-section booking-history">
        <p className="eyebrow">LỊCH SỬ TRẠNG THÁI</p>
        <h2>Các thay đổi của lượt đặt</h2>
        {history.map((event) => (
          <article className="admin-row" key={`${event.created_at}-${event.new_status}`}>
            <span>{event.old_status ? `${event.old_status} → ` : ""}{event.new_status}</span>
            <time>{formatVietnamDate(event.created_at)}</time>
          </article>
        ))}
      </section>
    </section>
  );
}
