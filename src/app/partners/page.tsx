import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function PartnersPage() {
  return (
    <>
      <SiteHeader />
      <main className="subpage">
        <p className="eyebrow">GROW WITH GOLF HUB</p>
        <h1>Cùng doanh nghiệp golf phát triển.</h1>
        <p className="subpage-intro">
          Sân golf, sân tập, học viện, câu lạc bộ và các đơn vị dịch vụ có thể
          gửi hồ sơ để đội ngũ Golf Hub xét duyệt.
        </p>
        <section className="partner-panel">
          <span aria-hidden="true" className="partner-panel-mark">GH</span>
          <div>
            <h2>Đăng ký trở thành đối tác.</h2>
            <p>
              Hồ sơ sẽ được quản trị viên xem xét. Sau khi được duyệt, chủ doanh
              nghiệp có thể gửi sân và khung giờ để xác minh trước khi công khai.
            </p>
            <Link href="/business/apply">
              Gửi hồ sơ đối tác <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
