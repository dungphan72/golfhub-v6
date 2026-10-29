import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { requirePlatformAdmin } from "@/lib/admin";
import { SiteFooter } from "@/components/site-footer";

export const instant = false;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="loading-state">Đang kiểm tra quyền quản trị...</div>}>
        <AdminHeader />
      </Suspense>
      <main className="dashboard-main">
        <Suspense fallback={<div className="loading-state">Đang tải bảng quản trị...</div>}>
          {children}
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function AdminHeader() {
  const { user } = await requirePlatformAdmin();

  return (
    <header className="dashboard-header">
      <Link className="brand" href="/admin">
        <span aria-hidden="true" className="brand-mark">GH</span>
        <span className="brand-name">GOLF<span>HUB</span></span>
      </Link>
      <nav aria-label="Điều hướng quản trị" className="dashboard-nav">
        <Link href="/admin">Tổng quan</Link>
        <Link href="/admin#partners">Đối tác</Link>
        <Link href="/admin#courses">Sân golf</Link>
        <Link href="/admin#audit">Nhật ký</Link>
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
