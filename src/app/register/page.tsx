import Link from "next/link";
import { signUpAction } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";

export default function RegisterPage() {
  return (
    <>
      <SiteHeader />
      <main className="auth-page">
        <section className="auth-card">
          <p className="eyebrow">JOIN THE COMMUNITY</p>
          <h1>Tạo tài khoản Golf Hub.</h1>
          <p className="auth-description">
            Bắt đầu xây dựng hồ sơ golfer của bạn.
          </p>
          <AuthForm action={signUpAction} mode="register" />
          <Link className="auth-back" href="/">← Về trang chủ</Link>
        </section>
      </main>
    </>
  );
}
