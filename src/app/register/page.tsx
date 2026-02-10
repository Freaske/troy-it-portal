import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/session";

import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const session = await getServerSession();
  if (session) {
    redirect("/");
  }

  return (
    <main className="login-shell">
      <section className="login-hero">
        <p className="eyebrow">HUST Student Enrollment</p>
        <h1>Create Student Portal Account</h1>
        <p>
          Đăng ký tài khoản sinh viên bằng email `@sis.hust.edu.vn`. Hệ thống sẽ gửi mã xác minh email 6 số trước khi
          tạo tài khoản, sau đó vẫn có lớp bảo mật mã thiết bị mới khi đăng nhập.
        </p>
        <div className="chip-row">
          <span className="chip">Domain-restricted account</span>
          <span className="chip">Email verification code</span>
          <span className="chip">New-device verification</span>
          <span className="chip">Student profile settings</span>
        </div>
      </section>

      <section className="login-panel">
        <h2>Đăng ký</h2>
        <RegisterForm />
      </section>
    </main>
  );
}
