import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link aria-label="Golf Hub home" className="brand" href="/">
        <span aria-hidden="true" className="brand-mark">
          GH
        </span>
        <span className="brand-name">
          GOLF<span>HUB</span>
        </span>
      </Link>
      <nav aria-label="Main navigation" className="main-nav">
        <Link href="/courses">Courses</Link>
        <Link href="/partners">For partners</Link>
        <Link href="/#about">About</Link>
      </nav>
      <Link className="header-action" href="/login">
        Đăng nhập <span aria-hidden="true">↗</span>
      </Link>
    </header>
  );
}
