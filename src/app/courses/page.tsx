import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCourseDirectory } from "@/lib/courses";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

type CoursesPageProps = {
  searchParams: Promise<{ q?: string; city?: string; page?: string }>;
};

export default function CoursesPage({ searchParams }: CoursesPageProps) {
  return (
    <>
      <SiteHeader />
      <main className="subpage">
        <p className="eyebrow">KHÁM PHÁ GOLF</p>
        <h1>Tìm sân golf tiếp theo.</h1>
        <p className="subpage-intro">
          Danh sách chỉ hiển thị sân đã được xác minh. Tìm kiếm theo tên sân
          hoặc thành phố.
        </p>
        <Suspense fallback={<div className="loading-state">Đang tải danh sách sân...</div>}>
          <CourseDirectorySearch searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function CourseDirectorySearch({ searchParams }: CoursesPageProps) {
  await connection();
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const result = await getCourseDirectory({
    query: params.q ?? "",
    city: params.city ?? "",
    page,
  });

  return (
    <>
        <form action="/courses" className="course-search">
          <label>
            Tên sân
            <input defaultValue={params.q} maxLength={80} name="q" />
          </label>
          <label>
            Thành phố
            <input defaultValue={params.city} maxLength={80} name="city" />
          </label>
          <button className="button button-primary">Tìm sân</button>
        </form>
        {result.status === "error" ? (
          <div className="inline-error" role="alert">
            Không thể tải danh sách sân lúc này. Vui lòng thử lại sau.
          </div>
        ) : result.status === "ok" && result.courses.length > 0 ? (
          <>
            <div className="course-grid">
              {result.courses.map((course) => (
                <article className="course-card" key={course.id}>
                  <p className="eyebrow">{course.city} · {course.province}</p>
                  <h2>{course.name}</h2>
                  <p>{course.address}</p>
                  <Link href={`/courses/${course.slug}`}>
                    Xem chi tiết <span aria-hidden="true">→</span>
                  </Link>
                </article>
              ))}
            </div>
            <nav aria-label="Phân trang danh sách sân" className="pagination">
              {result.page > 1 && (
                <Link
                  href={{
                    pathname: "/courses",
                    query: { q: params.q, city: params.city, page: result.page - 1 },
                  }}
                >
                  ← Trang trước
                </Link>
              )}
              {result.hasNextPage && (
                <Link
                  href={{
                    pathname: "/courses",
                    query: { q: params.q, city: params.city, page: result.page + 1 },
                  }}
                >
                  Trang sau →
                </Link>
              )}
            </nav>
          </>
        ) : (
          <section aria-labelledby="courses-empty-title" className="empty-state">
            <span aria-hidden="true" className="empty-icon">⌖</span>
            <h2 id="courses-empty-title">
              {result.status === "unconfigured"
                ? "Danh mục sân đang được thiết lập"
                : "Chưa tìm thấy sân phù hợp"}
            </h2>
            <p>
              {result.status === "unconfigured"
                ? "Kết nối Supabase và thêm dữ liệu sân đã xác minh để mở danh mục."
                : "Hiện chưa có sân golf đã xác minh khớp với tìm kiếm này."}
            </p>
            <Link className="button button-primary" href="/partners">
              Dành cho đối tác golf <span aria-hidden="true">↗</span>
            </Link>
          </section>
        )}
    </>
  );
}
