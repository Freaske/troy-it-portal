import Link from "next/link";
import { redirect } from "next/navigation";

import { ImportForm } from "@/app/admin/import/import-form";
import { getServerSession } from "@/lib/auth/session";

export default async function ImportPage() {
  const session = await getServerSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/?denied=admin");
  }

  return (
    <main className="page-shell">
      <section className="hero-block">
        <p className="eyebrow">Administration</p>
        <h1>Data Import Command</h1>
        <p>
          Đồng bộ dữ liệu học kỳ từ file <code>.xlsx</code> trực tiếp vào hệ thống, giữ chuẩn vận hành như
          cổng đào tạo trường đại học.
        </p>
      </section>

      <ImportForm />

      <p className="hint-text">
        Need full CRUD management? Open <Link href="/admin/academic">Academic Management</Link> or go back to the{" "}
        <Link href="/">dashboard timetable</Link>.
      </p>
    </main>
  );
}
