import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const pillars = [
  {
    number: "01",
    title: "Find your next course",
    description:
      "Explore golf destinations in one place. Course discovery will grow as verified partners join Golf Hub.",
    href: "/courses",
    link: "Explore courses",
  },
  {
    number: "02",
    title: "Play with your community",
    description:
      "Bring golfers, clubs, coaches, and events closer together through a shared digital home.",
    href: "#about",
    link: "Our vision",
  },
  {
    number: "03",
    title: "Grow your golf business",
    description:
      "A platform foundation for facilities and golf businesses to connect with the people they serve.",
    href: "/partners",
    link: "Partner with us",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" /> THE DIGITAL HOME OF GOLF
            </p>
            <h1>
              More than a
              <br />
              place to <span>play.</span>
            </h1>
            <p className="hero-description">
              Golf Hub connects golfers, courses, and the businesses that make
              every round memorable.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/courses">
                Explore golf <span aria-hidden="true">↗</span>
              </Link>
              <Link className="button button-secondary" href="/partners">
                For golf businesses
              </Link>
            </div>
            <p className="hero-note">
              A growing golf ecosystem, designed for Vietnam.
            </p>
          </div>
          <div aria-label="Golf course illustration" className="hero-art" role="img">
            <div className="sun-disc" />
            <div className="course-hill course-hill-back" />
            <div className="course-hill course-hill-front" />
            <div className="course-green">
              <span className="flagpole" />
              <span className="flag" />
              <span className="hole" />
            </div>
            <div className="art-label">
              <span className="art-label-dot" />
              BUILT AROUND THE GAME
            </div>
            <span className="art-grain" />
          </div>
          <div aria-hidden="true" className="hero-index">
            <span>01</span>
            <span className="hero-index-line" />
            <span>03</span>
          </div>
        </section>

        <section aria-label="Our focus" className="focus-strip">
          <p>One connected platform</p>
          <span>GOLFERS</span>
          <span aria-hidden="true" className="focus-separator">•</span>
          <span>COURSES</span>
          <span aria-hidden="true" className="focus-separator">•</span>
          <span>COMMUNITY</span>
          <span aria-hidden="true" className="focus-separator">•</span>
          <span>BUSINESSES</span>
        </section>

        <section className="ecosystem section-wrap" id="about">
          <div className="section-heading">
            <div>
              <p className="eyebrow">A BETTER WAY TO CONNECT</p>
              <h2>One game. Many ways to belong.</h2>
            </div>
            <p className="section-intro">
              Golf is more than a tee time. We are building the infrastructure
              to bring every part of the golf experience together.
            </p>
          </div>
          <div className="pillar-grid">
            {pillars.map((pillar) => (
              <article className="pillar-card" key={pillar.number}>
                <span className="pillar-number">{pillar.number}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.description}</p>
                <Link href={pillar.href}>
                  {pillar.link} <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="partner-callout section-wrap">
          <div>
            <p className="eyebrow">FOR GOLF BUSINESSES</p>
            <h2>Let’s build a stronger game together.</h2>
            <p>
              Golf courses, ranges, coaches, clubs, and golf service providers
              are invited to help shape the platform.
            </p>
          </div>
          <Link className="button button-light" href="/partners">
            Learn about partnering <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
