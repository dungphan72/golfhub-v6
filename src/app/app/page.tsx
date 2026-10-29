import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";

export const instant = false;

export default async function GolferDashboardPage() {
  const { user } = await requireCurrentUser();

  return (
    <section className="dashboard-content">
      <p className="eyebrow">GOLFER SPACE</p>
      <h1>Chào mừng{user.user_metadata.full_name ? `, ${user.user_metadata.full_name}` : ""}.</h1>
      <p className="subpage-intro">
        Hồ sơ và hành trình chơi golf của bạn bắt đầu từ đây. Chỉ những sân đã
        được xác minh mới xuất hiện trong danh sách.
      </p>
      <div className="dashboard-cards">
        <Link className="dashboard-card" href="/courses">
          <span className="pillar-number">KHÁM PHÁ</span>
          <h2>Tìm sân golf</h2>
          <p>Xem danh sách sân đã được đối tác xác minh.</p>
          <span className="text-link">Khám phá sân →</span>
        </Link>
        <Link className="dashboard-card" href="/app/bookings">
          <span className="pillar-number">ĐẶT CHỖ</span>
          <h2>Lịch đặt sân</h2>
          <p>Theo dõi trạng thái giữ chỗ và các lượt đặt sân.</p>
          <span className="text-link">Xem lịch đặt →</span>
        </Link>
        <Link className="dashboard-card" href="/app/profile">
          <span className="pillar-number">TÀI KHOẢN</span>
          <h2>Hồ sơ golfer</h2>
          <p>Cập nhật thông tin cá nhân của bạn.</p>
          <span className="text-link">Cập nhật hồ sơ →</span>
        </Link>
      </div>
    </section>
  );
}
