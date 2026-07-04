import Beast from "@/components/Beast";
import WaitlistForm from "@/components/WaitlistForm";

const squad = [
  { name: "Chomper", body: "#16745a", belly: "#a3e635", eyes: 1 as const, horns: false },
  { name: "Gorp", body: "#7c3aed", belly: "#c4b5fd", eyes: 2 as const, horns: true },
  { name: "Tangle", body: "#f97316", belly: "#fed7aa", eyes: 1 as const, horns: true },
  { name: "Bloop", body: "#0891b2", belly: "#a5f3fc", eyes: 2 as const, horns: false },
];

export default function Home() {
  return (
    <main className="overflow-x-hidden pb-16 md:pb-0">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-swamp-700/10 bg-cream/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#top" className="flex items-center gap-2 font-display text-2xl font-bold text-swamp-700">
            <span className="text-3xl" aria-hidden>👾</span>
            Brushbeasts
          </a>
          <a
            href="#waitlist"
            className="rounded-full bg-swamp-700 px-5 py-2.5 text-sm font-extrabold text-slime-100 transition hover:bg-swamp-600"
          >
            Join the waitlist
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section id="top" className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.slime-100),transparent_60%)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="inline-block rounded-full bg-grape-500/15 px-4 py-1.5 text-sm font-bold text-grape-600">
              🚀 Coming soon to Kickstarter
            </span>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] text-swamp-800 sm:text-6xl">
              Show your teeth,{" "}
              <span className="text-grape-600">brush like a beast.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-ink/70">
              Brushbeasts are collectible little monsters that gently hold cheeky
              mouths open — so brushing goes from a nightly wrestling match to the
              best two minutes of the day.
            </p>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-swamp-700">
              <li>✅ Free to join</li>
              <li>✅ Early-bird pricing</li>
              <li>✅ A launch-only beast</li>
            </ul>
            <div id="waitlist-hero" className="mt-5 max-w-lg">
              <WaitlistForm />
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="absolute h-72 w-72 rounded-full bg-slime-300/40 blur-3xl" />
            <Beast
              body="#16745a"
              belly="#a3e635"
              horns
              className="animate-float relative h-72 w-72 drop-shadow-2xl sm:h-96 sm:w-96"
            />
            <Beast
              body="#7c3aed"
              belly="#c4b5fd"
              eyes={2}
              className="animate-float-slow absolute -bottom-4 -left-2 h-28 w-28 sm:h-36 sm:w-36"
            />
            <Beast
              body="#f97316"
              belly="#fed7aa"
              horns
              className="animate-wiggle absolute -right-1 top-2 h-24 w-24 sm:h-28 sm:w-28"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 pt-8 pb-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-swamp-700/10 px-4 py-1.5 text-sm font-bold text-swamp-700">
            What is it?
          </span>
          <h2 className="mt-4 font-display text-4xl font-bold text-swamp-800">
            A monster mouth-rest. Three steps to happier brushing.
          </h2>
          <p className="mt-4 text-lg text-ink/70">
            Brushbeasts is a soft, food-grade silicone rest — shaped like a friendly
            monster — that gently props little mouths open at brushing time.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              step: "1",
              title: "Pick a beast",
              body: "Your kid chooses tonight's Brushbeast from their collection.",
            },
            {
              step: "2",
              title: "Pop it in",
              body: "It sits softly between the teeth, holding lips and cheeks back — hands-free.",
            },
            {
              step: "3",
              title: "Brush like a beast",
              body: "You can see and reach every tooth. A proper clean, no wrestling.",
            },
          ].map((s) => (
            <div
              key={s.step}
              className="relative rounded-3xl border border-swamp-700/10 bg-white p-7 shadow-sm"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-grape-500 font-display text-xl font-bold text-white">
                {s.step}
              </div>
              <h3 className="mt-4 font-display text-xl font-bold text-swamp-700">
                {s.title}
              </h3>
              <p className="mt-2 text-ink/70">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof strip */}
      <section className="mt-12 border-y border-swamp-700/10 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 text-center md:grid-cols-4">
          {[
            ["2 min", "of happy brushing"],
            ["100%", "food-grade silicone"],
            ["1 goal", "healthy little smiles"],
            ["∞", "beasts to collect"],
          ].map(([big, small]) => (
            <div key={small}>
              <p className="font-display text-3xl font-bold text-swamp-700">{big}</p>
              <p className="text-sm text-ink/60">{small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold text-swamp-800">
            Every parent knows the 7pm battle.
          </h2>
          <p className="mt-4 text-lg text-ink/70">
            Clamped-shut mouths. Wriggling. Tears (sometimes yours). Little kids
            won&apos;t hold still, and you can&apos;t see the teeth you&apos;re trying to
            clean. Brushbeasts flips the script — the monster does the holding, so
            you can do the brushing.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: "😬",
              title: "Mouths stay open",
              body: "A soft, one-piece silicone rest gently keeps lips and cheeks back — no pinching, no hard edges.",
            },
            {
              icon: "🪥",
              title: "You can actually reach",
              body: "Full view of every tooth means a proper clean in half the time, front and back.",
            },
            {
              icon: "🎉",
              title: "Kids ask to brush",
              body: "“Which beast tonight?” beats “time to brush” every single time.",
            },
          ].map((c) => (
            <div
              key={c.title}
              className="rounded-3xl border border-swamp-700/10 bg-white p-7 shadow-sm"
            >
              <div className="text-4xl">{c.icon}</div>
              <h3 className="mt-4 font-display text-xl font-bold text-swamp-700">
                {c.title}
              </h3>
              <p className="mt-2 text-ink/70">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Collect the squad */}
      <section className="bg-swamp-800 py-20 text-cream">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-4xl font-bold">Collect the whole squad.</h2>
            <p className="mt-4 text-lg text-slime-100/70">
              Glow-in-the-dark, jewel-tone, one-eyed, two-horned — every Brushbeast
              has a name and a personality. Trade the &quot;brush tonight&quot; nag for
              &quot;gotta catch &apos;em all.&quot;
            </p>
          </div>
          <div className="mt-14 grid grid-cols-2 gap-6 md:grid-cols-4">
            {squad.map((b) => (
              <div
                key={b.name}
                className="group rounded-3xl bg-swamp-700/60 p-6 text-center ring-1 ring-white/5 transition hover:-translate-y-1 hover:bg-swamp-700"
              >
                <Beast
                  body={b.body}
                  belly={b.belly}
                  eyes={b.eyes}
                  horns={b.horns}
                  className="mx-auto h-28 w-28 transition group-hover:scale-105"
                />
                <p className="mt-3 font-display text-lg font-bold">{b.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <span className="inline-block rounded-full bg-slime-300/40 px-4 py-1.5 text-sm font-bold text-swamp-700">
              Built for little mouths
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold text-swamp-800">
              Safety isn&apos;t a feature. It&apos;s the whole point.
            </h2>
            <p className="mt-4 text-lg text-ink/70">
              Anything that goes in a child&apos;s mouth deserves obsessive care. Every
              Brushbeast is designed and tested to the standards parents expect.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "100% food-grade, platinum-cured silicone — BPA, PVC, phthalate & latex free",
                "One solid piece: no small parts, no eyes or horns that can come loose",
                "Oversized safety flange sits outside the lips — no swallow risk",
                "Independently lab-tested to toy-safety standards (EN 71 / ASTM F963 / AS-NZS ISO 8124)",
                "Dishwasher-safe and easy to keep clean",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-ink/80">
                  <span className="mt-1 text-slime-500" aria-hidden>
                    ✔
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-ink/50">
              Always use with adult supervision. Certification in progress ahead of
              our first production run.
            </p>
          </div>
          <div className="relative flex justify-center">
            <div className="absolute h-64 w-64 rounded-full bg-grape-300/30 blur-3xl" />
            <Beast
              body="#0891b2"
              belly="#a5f3fc"
              eyes={2}
              className="animate-float relative h-72 w-72"
            />
          </div>
        </div>
      </section>

      {/* Kickstarter CTA / waitlist */}
      <section id="waitlist" className="bg-gradient-to-b from-grape-500 to-grape-600 py-20 text-white">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <span className="inline-block rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold">
            🚀 Backing opens on Kickstarter soon
          </span>
          <h2 className="mt-5 font-display text-4xl font-bold sm:text-5xl">
            Be first in the pack.
          </h2>
          <p className="mt-4 text-lg text-white/80">
            Join the waitlist for early-bird pricing, exclusive launch-only beasts,
            and a heads-up the moment we go live. Help us make brushing the best two
            minutes of the day.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <WaitlistForm variant="dark" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-swamp-800 py-10 text-slime-100/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 sm:flex-row">
          <p className="flex items-center gap-2 font-display text-lg font-bold text-cream">
            <span aria-hidden>👾</span> Brushbeasts
          </p>
          <p className="text-sm">
            © {new Date().getFullYear()} Brushbeasts. A concept in the making. Name &
            branding subject to trademark clearance.
          </p>
        </div>
      </footer>

      {/* Mobile sticky CTA */}
      <a
        href="#waitlist"
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 border-t border-swamp-800/20 bg-tang-500 px-5 py-4 text-center font-extrabold text-white shadow-2xl md:hidden"
      >
        <span aria-hidden>👾</span> Join the waitlist — it&apos;s free
      </a>
    </main>
  );
}
