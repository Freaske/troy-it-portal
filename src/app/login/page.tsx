import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { getDemoUsers, getServerSession } from "@/lib/auth/session";

export default async function LoginPage() {
  const session = await getServerSession();
  if (session) {
    redirect("/");
  }

  const demoUsers = getDemoUsers();

  return (
    <main className="login-shell">
      <section className="login-hero">
        <p className="eyebrow">HUST Portal Access</p>
        <h1>Secure Academic Command Center</h1>
        <p>
          Đăng nhập để truy cập hệ thống TKB, học liệu, đánh giá giảng viên và dashboard quản trị theo chuẩn
          vận hành đại học. Account sinh viên mới yêu cầu email `@sis.hust.edu.vn` và xác thực thiết bị mới bằng mã
          OTP.
        </p>
        <div className="chip-row">
          <span className="chip">HUST-style UI</span>
          <span className="chip">Troy integrated resources</span>
          <span className="chip">Device verification</span>
        </div>
      </section>

      <section className="login-panel">
        <h2>Sign in</h2>
        <LoginForm />
        <p className="hint-text">
          Student mới? <Link href="/register">Tạo tài khoản tại đây</Link>
        </p>

        <div className="demo-box">
          <p className="muted-small">Role permissions:</p>
          <ul className="simple-list">
            <li>
              <code>ADMIN</code>
              <span className="muted-small">Full scope filters, conflict panel, and import management.</span>
            </li>
            <li>
              <code>LECTURER</code>
              <span className="muted-small">Teaching-focused dashboard and faculty pages, no import access.</span>
            </li>
            <li>
              <code>STUDENT</code>
              <span className="muted-small">Locked class scope with matrix/agenda timetable views.</span>
            </li>
          </ul>

          <p className="muted-small">Demo accounts (có thể đổi bằng env `PORTAL_USERS`):</p>
          <ul className="simple-list">
            {demoUsers.map((user) => (
              <li key={user.username}>
                <code>
                  {user.username} / {user.password}
                </code>
                <span className="muted-small">{user.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
