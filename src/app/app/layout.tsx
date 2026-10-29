import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { signOutAction } from "@/app/actions/auth";
import { requireCurrentUser } from "@/lib/auth";
import { SiteFooter } from "@/components/site-footer";

export const instant = false;

export default function GolferLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <Suspense fallback={<div className="loading-state">Đang kiểm tra phiên đăng nhập...</div>}>
        <DashboardHeader />
      </Suspense>
      <main className="dashboard-main">
        <Suspense fallback={<div className="loading-state">Đang tải khu vực cá nhân...</div>}>
          {children}
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function DashboardHeader() {
  const { user } = await requireCurrentUser();

  return (
    <header className="dashboard-header">
        <Link className="brand" href="/app">
          <span aria-hidden="true" className="brand-mark">GH</span>
          <span className="brand-name">GOLF<span>HUB</span></span>
        </Link>
        <nav aria-label="Điều hướng tài khoản" className="dashboard-nav">
          <Link href="/app">Tổng quan</Link>
          <Link href="/app/bookings">Đặt sân</Link>
          <Link href="/app/notifications">Thông báo</Link>
          <Link href="/app/profile">Hồ sơ</Link>
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
