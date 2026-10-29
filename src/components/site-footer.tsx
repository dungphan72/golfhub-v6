import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link aria-label="Golf Hub home" className="brand footer-brand" href="/">
        <span aria-hidden="true" className="brand-mark">
          GH
        </span>
        <span className="brand-name">
          GOLF<span>HUB</span>
        </span>
      </Link>
      <p>Connecting Vietnam’s golf community.</p>
      <span className="footer-note">Building the foundation, one round at a time.</span>
    </footer>
  );
}
