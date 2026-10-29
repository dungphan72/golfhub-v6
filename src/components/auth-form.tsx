"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "@/app/actions/auth";

type AuthAction = (
  state: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

type AuthFormProps = {
  action: AuthAction;
  mode: "login" | "register";
  notice?: string;
  nextPath?: string;
};

export function AuthForm({ action, mode, notice, nextPath }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const isRegister = mode === "register";

  return (
    <form action={formAction} className="auth-form">
      {nextPath && <input name="next" type="hidden" value={nextPath} />}
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {isRegister && (
        <label>
          Họ và tên
          <input
            autoComplete="name"
            maxLength={160}
            name="fullName"
            required
            type="text"
          />
        </label>
      )}
      <label>
        Email
        <input
          autoComplete="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </label>
      <label>
        Mật khẩu
        <input
          autoComplete={isRegister ? "new-password" : "current-password"}
          maxLength={128}
          minLength={12}
          name="password"
          required
          type="password"
        />
        {isRegister && (
          <span className="field-hint">Tối thiểu 12 ký tự.</span>
        )}
      </label>
      <button className="button button-primary auth-submit" disabled={pending}>
        {pending
          ? "Đang xử lý..."
          : isRegister
            ? "Tạo tài khoản"
            : "Đăng nhập"}
      </button>
      <p className="auth-switch">
        {isRegister ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
        <Link href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Đăng nhập" : "Đăng ký"}
        </Link>
      </p>
    </form>
  );
}
