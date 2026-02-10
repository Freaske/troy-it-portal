import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { getServerSession } from "@/lib/auth/session";

export default async function LoginPage() {
  const session = await getServerSession();
  if (session) {
    redirect("/");
  }

  return (
    <main className="login-shell">
      <section className="login-hero">
        <p className="eyebrow">HUST x Troy IT</p>
        <h1>Đăng nhập cổng học vụ</h1>
        <p>Truy cập thời khóa biểu, học liệu, đánh giá giảng viên và hệ thống quản trị.</p>
        <div className="chip-row">
          <span className="chip">Single portal</span>
          <span className="chip">Email + Device verification</span>
        </div>
      </section>

      <section className="login-panel">
        <h2>Sign in</h2>
        <LoginForm />
        <p className="hint-text">
          Chưa có tài khoản? <Link href="/register">Đăng ký</Link>
        </p>
      </section>
    </main>
  );
}
