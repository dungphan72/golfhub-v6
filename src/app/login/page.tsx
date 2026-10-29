import Link from "next/link";
import { Suspense } from "react";
import { signInAction } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";

type LoginPageProps = {
  searchParams: Promise<{ checkEmail?: string; error?: string; next?: string }>;
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <>
      <SiteHeader />
      <main className="auth-page">
        <Suspense fallback={<div className="loading-state">Đang tải...</div>}>
          <LoginCard searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function LoginCard({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const notice =
    params.checkEmail === "1"
      ? "Tài khoản đã được tạo. Hãy xác nhận email trước khi đăng nhập."
      : params.error === "pkce"
        ? "Không tìm thấy mã xác minh trên trình duyệt này. Hãy mở email xác nhận trong cùng trình duyệt và địa chỉ đã đăng ký."
        : params.error === "expired"
          ? "Liên kết xác nhận đã hết hạn hoặc đã được sử dụng. Hãy đăng ký lại hoặc yêu cầu gửi liên kết mới."
          : params.error === "callback"
            ? "Không thể hoàn tất xác nhận email. Hãy kiểm tra liên kết hoặc thử đăng nhập lại."
        : params.error === "configuration"
          ? "Đăng nhập chưa khả dụng. Cần cấu hình Supabase theo hướng dẫn thiết lập."
        : undefined;

  return (
    <>
        <section className="auth-card">
          <p className="eyebrow">GOLF HUB ACCOUNT</p>
          <h1>Chào mừng trở lại.</h1>
          <p className="auth-description">
            Đăng nhập để tiếp tục hành trình golf của bạn.
          </p>
          <AuthForm
            action={signInAction}
            mode="login"
            nextPath={params.next}
            notice={notice}
          />
          <Link className="auth-back" href="/">← Về trang chủ</Link>
        </section>
    </>
  );
}
