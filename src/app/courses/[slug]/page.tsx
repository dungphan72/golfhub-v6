import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookingForm } from "@/components/booking-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { createBookingAction } from "@/app/courses/[slug]/booking-actions";
import { getCourseBySlug } from "@/lib/courses";

type CoursePageProps = {
  params: Promise<{ slug: string }>;
};

function formatVietnamDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CourseDetailPage({ params }: CoursePageProps) {
  return (
    <>
      <SiteHeader />
      <main className="subpage">
        <Suspense fallback={<div className="loading-state">Đang tải thông tin sân...</div>}>
          <CourseDetail params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function CourseDetail({ params }: CoursePageProps) {
  await connection();
  const { slug } = await params;
  const result = await getCourseBySlug(slug);

  if (result.status === "not_found") {
    notFound();
  }

  return (
    <>
        <Link className="back-link" href="/courses">← Tất cả sân golf</Link>
        {result.status !== "ok" ? (
          <section aria-labelledby="course-loading-title" className="empty-state">
            <h1 id="course-loading-title">
              {result.status === "unconfigured"
                ? "Danh mục sân đang được thiết lập"
                : "Không thể tải thông tin sân"}
            </h1>
            <p>
              {result.status === "unconfigured"
                ? "Kết nối Supabase để xem thông tin sân đã xác minh."
                : "Vui lòng thử lại sau."}
            </p>
            {result.status === "unconfigured" && (
              <Link className="button button-primary" href="/courses">
                Quay lại danh sách
              </Link>
            )}
          </section>
        ) : (
          <>
            <p className="eyebrow">{result.course.city} · {result.course.province}</p>
            <h1>{result.course.name}</h1>
            <p className="subpage-intro">{result.course.address}</p>
            {result.course.description && (
              <p className="course-description">{result.course.description}</p>
            )}
            {result.course.amenities.length > 0 && (
              <ul aria-label="Tiện ích" className="amenity-list">
                {result.course.amenities.map((amenity) => (
                  <li key={amenity}>{amenity}</li>
                ))}
              </ul>
            )}
            <section aria-labelledby="tee-times-title" className="tee-time-section">
              <div>
                <p className="eyebrow">GIỮ CHỖ TRỰC TUYẾN</p>
                <h2 id="tee-times-title">Khung giờ khả dụng</h2>
                <p className="booking-disclaimer">
                  Giữ chỗ tạm thời trong 10 phút. Golf Hub chưa thu tiền và chưa
                  xác nhận đặt sân bằng thanh toán thật.
                </p>
              </div>
              {result.teeTimes.length === 0 ? (
                <div className="empty-state tee-time-empty">
                  <p>Chưa có khung giờ khả dụng được đối tác cập nhật.</p>
                </div>
              ) : (
                <div className="tee-time-list">
                  {result.teeTimes.map((teeTime) => (
                    <article className="tee-time-card" key={teeTime.id}>
                      <div>
                        <time dateTime={teeTime.starts_at}>
                          {formatVietnamDate(teeTime.starts_at)}
                        </time>
                        <p>
                          {formatVnd(teeTime.price_per_player_minor)} / người · còn{" "}
                          {teeTime.available_seats} chỗ
                        </p>
                      </div>
                      <BookingForm
                        action={createBookingAction}
                        courseSlug={result.course.slug}
                        capacity={teeTime.available_seats}
                        idempotencyKey={randomUUID()}
                        teeTimeId={teeTime.id}
                      />
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
    </>
  );
}
