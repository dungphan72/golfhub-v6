import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { requireCurrentUser } from "@/lib/auth";
import { SiteFooter } from "@/components/site-footer";

export const instant = false;

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="loading-state">Đang kiểm tra phiên đăng nhập...</div>}>
        <BusinessHeader />
      </Suspense>
      <main className="dashboard-main">
        <Suspense fallback={<div className="loading-state">Đang tải khu vực đối tác...</div>}>
          {children}
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function BusinessHeader() {
  const { user } = await requireCurrentUser("/business");

  return (
    <header className="dashboard-header">
      <Link className="brand" href="/business">
        <span aria-hidden="true" className="brand-mark">GH</span>
        <span className="brand-name">GOLF<span>HUB</span></span>
      </Link>
      <nav aria-label="Điều hướng đối tác" className="dashboard-nav">
        <Link href="/business">Tổng quan</Link>
        <Link href="/business/courses">Sân & khung giờ</Link>
        <Link href="/business/bookings">Đặt sân</Link>
        <Link href="/business/reports">Báo cáo</Link>
        <Link href="/business/apply">Hồ sơ đối tác</Link>
      </nav>
      <div className="dashboard-account">
        <span>{user.email}</span>
        <form action={signOutAction}>
          <button className="signout-button" type="submit">Đăng xuất</button>
        </form>
      </div>
    </header>
  );
}
