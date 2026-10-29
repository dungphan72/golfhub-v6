import Link from "next/link";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

export const instant = false;

const reportSchema = z.array(z.object({
  partner_id: z.string().uuid(),
  partner_name: z.string(),
  booking_count: z.coerce.number().int().nonnegative(),
  player_count: z.coerce.number().int().nonnegative(),
  pending_payment_count: z.coerce.number().int().nonnegative(),
  confirmed_count: z.coerce.number().int().nonnegative(),
  cancelled_count: z.coerce.number().int().nonnegative(),
  expired_count: z.coerce.number().int().nonnegative(),
  completed_count: z.coerce.number().int().nonnegative(),
  payment_failed_count: z.coerce.number().int().nonnegative(),
  active_booking_value_minor: z.union([
    z.string().regex(/^\d+$/),
    z.number().int().nonnegative().transform(String),
  ]),
}));

const reportPeriods = [7, 30, 90] as const;
type ReportPeriod = (typeof reportPeriods)[number];

function formatVnd(value: bigint) {
  return `${new Intl.NumberFormat("vi-VN").format(value)} VND`;
}

export default async function PartnerReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const [{ supabase }, params] = await Promise.all([
    requireCurrentUser("/business/reports"),
    searchParams,
  ]);
  const selectedPeriod: ReportPeriod = reportPeriods.find(
    (period) => String(period) === params.days,
  ) ?? 30;
  const periodTo = new Date();
  const periodFrom = new Date(periodTo.getTime() - selectedPeriod * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase.rpc("get_my_partner_booking_report", {
    requested_from: periodFrom.toISOString(),
    requested_to: periodTo.toISOString(),
  });

  if (error) {
    console.error("Could not load partner booking report", { code: error.code });
    throw new Error("Không thể tải báo cáo đặt sân.");
  }

  const report = reportSchema.safeParse(data);
  if (!report.success) {
    console.error("Partner booking report returned an invalid shape");
    throw new Error("Dữ liệu báo cáo không hợp lệ.");
  }

  const totals = report.data.reduce(
    (summary, row) => ({
      bookings: summary.bookings + row.booking_count,
      players: summary.players + row.player_count,
      pending: summary.pending + row.pending_payment_count,
      activeValue: summary.activeValue + BigInt(row.active_booking_value_minor),
    }),
    { bookings: 0, players: 0, pending: 0, activeValue: BigInt(0) },
  );
  const periodLabel = (date: Date) => new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);

  return (
    <section className="dashboard-content">
      <p className="eyebrow">BÁO CÁO ĐỐI TÁC</p>
      <h1>Báo cáo đặt sân</h1>
      <p className="subpage-intro">
        Thống kê theo ngày tạo booking từ {periodLabel(periodFrom)} đến {periodLabel(periodTo)}.
      </p>

      <nav className="report-periods" aria-label="Khoảng thời gian báo cáo">
        {reportPeriods.map((period) => (
          <Link
            aria-current={period === selectedPeriod ? "page" : undefined}
            className={period === selectedPeriod ? "report-period-active" : ""}
            href={`/business/reports?days=${period}`}
            key={period}
          >
            {period} ngày
          </Link>
        ))}
      </nav>

      <div className="report-summary">
        <article>
          <span>Tổng lượt đặt</span>
          <strong>{totals.bookings.toLocaleString("vi-VN")}</strong>
        </article>
        <article>
          <span>Số người chơi</span>
          <strong>{totals.players.toLocaleString("vi-VN")}</strong>
        </article>
        <article>
          <span>Chờ thanh toán</span>
          <strong>{totals.pending.toLocaleString("vi-VN")}</strong>
        </article>
        <article>
          <span>Giá trị booking còn hiệu lực</span>
          <strong>{formatVnd(totals.activeValue)}</strong>
        </article>
      </div>

      <p className="report-disclaimer">
        Giá trị booking chỉ là số tiền ghi nhận cho các lượt chờ thanh toán, đã xác nhận
        hoặc hoàn tất; không phải doanh thu đã thu hay số tiền đã quyết toán cho đối tác.
      </p>

      {report.data.length === 0 ? (
        <section className="empty-state booking-empty">
          <h2>Chưa có doanh nghiệp được liên kết</h2>
          <p>Báo cáo sẽ xuất hiện khi tài khoản được thêm vào doanh nghiệp đối tác.</p>
        </section>
      ) : (
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Doanh nghiệp</th>
                <th scope="col">Lượt đặt</th>
                <th scope="col">Người chơi</th>
                <th scope="col">Chờ thanh toán</th>
                <th scope="col">Đã xác nhận / hoàn tất</th>
                <th scope="col">Hủy / hết hạn / lỗi</th>
                <th scope="col">Giá trị còn hiệu lực</th>
              </tr>
            </thead>
            <tbody>
              {report.data.map((row) => (
                <tr key={row.partner_id}>
                  <th scope="row">{row.partner_name}</th>
                  <td>{row.booking_count.toLocaleString("vi-VN")}</td>
                  <td>{row.player_count.toLocaleString("vi-VN")}</td>
                  <td>{row.pending_payment_count.toLocaleString("vi-VN")}</td>
                  <td>{(row.confirmed_count + row.completed_count).toLocaleString("vi-VN")}</td>
                  <td>
                    {(row.cancelled_count + row.expired_count + row.payment_failed_count)
                      .toLocaleString("vi-VN")}
                  </td>
                  <td>{formatVnd(BigInt(row.active_booking_value_minor))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
