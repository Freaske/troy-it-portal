import { redirect } from "next/navigation";

import { getUserProfile } from "@/lib/auth/accounts";
import { getServerSession } from "@/lib/auth/session";

import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const profile = await getUserProfile(session.username, session.role);
  const initial = profile ?? {
    username: session.username,
    role: session.role,
    email: session.email ?? null,
    displayName: session.name,
    cohortCode: session.cohortCode ?? null,
    classGroupName: session.classGroupName ?? null,
    studentCode: session.studentCode ?? null,
    preferredLanguage: session.language ?? "VI",
  };

  return (
    <main className="page-shell">
      <section className="hero-block">
        <p className="eyebrow">Cài Đặt Hồ Sơ</p>
        <h1>Hồ sơ học vụ cá nhân</h1>
        <p>
          Cập nhật thông tin cá nhân để đồng bộ trải nghiệm theo vai trò. Sinh viên có thể chỉnh khóa/lớp/mã sinh
          viên và ngôn ngữ giao diện (Việt/Anh/Nhật).
        </p>
      </section>

      <section className="details-card">
        <h2>Thiết lập tài khoản</h2>
        <ProfileForm initial={initial} />
      </section>
    </main>
  );
}
