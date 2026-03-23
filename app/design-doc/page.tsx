import {
  deploymentNotes,
  designDocSections,
  pilotFeedback,
} from "@/lib/competition/content";
import Link from "next/link";

export default function DesignDocPage() {
  return (
    <div className="competition-shell">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="hero-panel">
          <p className="eyebrow">Competition Design Document</p>
          <h1 className="hero-title text-[clamp(2.5rem,6vw,4.8rem)]">
            Adrena Prop Challenge Hub
          </h1>
          <p className="hero-copy">
            This prototype proposes a competition layer that makes paid cohort
            trading legible, aspirational, and operationally safe. The goal is
            to outperform simple PnL leaderboards by making status, progression,
            and anti-abuse logic visible.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/" className="secondary-button">
              Back to prototype
            </Link>
          </div>
        </section>

        <section className="grid gap-6">
          {designDocSections.map((section) => (
            <article key={section.title} className="panel">
              <p className="eyebrow">{section.title}</p>
              <ul className="space-y-3 text-base leading-relaxed text-white/78">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="panel">
            <p className="eyebrow">Deployment</p>
            <h2 className="section-title">Configure and ship</h2>
            <ul className="mt-4 space-y-3 text-base leading-relaxed text-white/76">
              {deploymentNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <p className="eyebrow">Testing and Feedback</p>
            <h2 className="section-title">Seed cohort readout</h2>
            <ul className="mt-4 space-y-3 text-base leading-relaxed text-white/76">
              {pilotFeedback.map((item) => (
                <li key={item.group}>
                  <strong className="text-white">{item.group}:</strong>{" "}
                  {item.note}
                </li>
              ))}
            </ul>
          </article>
        </section>
      </main>
    </div>
  );
}
