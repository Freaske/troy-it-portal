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
        <p className="eyebrow">Student Registration</p>
        <h1>Tạo tài khoản sinh viên</h1>
        <p>Email phải thuộc miền `@sis.hust.edu.vn`.</p>
        <div className="chip-row">
          <span className="chip">Email verification code</span>
          <span className="chip">Secure sign-in</span>
        </div>
      </section>

      <section className="login-panel">
        <h2>Register</h2>
        <RegisterForm />
      </section>
    </main>
  );
}
