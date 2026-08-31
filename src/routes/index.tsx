import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  HeartPulse,
  Languages,
  Megaphone,
  MessageSquareQuote,
  Radio,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PATIENT_LANGUAGES } from "@/lib/joji";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JOJI — Africa's multilingual health communication platform" },
      {
        name: "description",
        content:
          "JOJI helps Nigerian hospitals, NGOs and health workers speak with every patient in Yorùbá, Igbo, Hausa and Nigerian Pidgin.",
      },
      {
        property: "og:title",
        content: "JOJI — Africa's multilingual health communication platform",
      },
      {
        property: "og:description",
        content:
          "Real-time translation, campaign kits and maternal health tools built for Nigeria.",
      },
    ],
  }),
  component: Landing,
});

const STATS = [
  { value: "500+", label: "Languages spoken in Nigeria" },
  { value: "4", label: "Core languages supported today" },
  { value: "<3s", label: "Typical translation turnaround" },
  { value: "100%", label: "Drafts reviewable before publishing" },
];

const PRODUCTS = [
  {
    icon: Languages,
    name: "Campaigns",
    copy: "Turn one health document into leaflets, radio scripts, SMS, WhatsApp and community worker guides across four Nigerian languages.",
  },
  {
    icon: Stethoscope,
    name: "Care",
    copy: "Live, two-panel consultation translation so a clinician and a patient can understand each other in the room, out loud.",
  },
  {
    icon: HeartPulse,
    name: "Research",
    copy: "Maternal health calculators and NPHCDA immunisation schedules that field teams can run without a data connection.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <MessageSquareQuote className="size-4.5" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-lg font-semibold">JOJI</p>
              <p className="label-mono text-muted-foreground">MedNova Lifesciences</p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link to="/auth">
              Get started <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="paper-glow">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-28">
          <div>
            <p className="label-mono inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald" /> Built for Nigerian health systems
            </p>
            <h1 className="mt-6 text-4xl leading-[1.05] font-semibold sm:text-5xl lg:text-6xl">
              Africa's multilingual health communication platform.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              JOJI closes the language gap between clinicians and the people they treat — in the
              consulting room, over the radio, and across every community campaign.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  Get started <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#products">See what's inside</a>
              </Button>
            </div>
            <div className="mt-9 flex flex-wrap gap-2">
              {PATIENT_LANGUAGES.map((l) => (
                <span
                  key={l.code}
                  className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium shadow-[var(--shadow-soft)]"
                >
                  {l.label}
                </span>
              ))}
              <span className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium shadow-[var(--shadow-soft)]">
                English
              </span>
            </div>
          </div>

          <div className="deep-panel rounded-3xl p-6 shadow-[var(--shadow-lift)] sm:p-8">
            <p className="label-mono text-cream/60">Live consultation</p>
            <div className="mt-5 space-y-3">
              <div className="animate-rise rounded-2xl rounded-tl-sm bg-cream/10 p-4">
                <p className="label-mono text-cream/60">Patient · Yorùbá</p>
                <p className="mt-1.5 text-cream">Orí mi ń fọ́, ara mi sì gbóná láti àná.</p>
              </div>
              <div className="animate-rise rounded-2xl rounded-tr-sm bg-cyan/20 p-4">
                <p className="label-mono text-cream/70">Doctor sees · English</p>
                <p className="mt-1.5 text-cream">
                  I have a headache and I've had a fever since yesterday.
                </p>
              </div>
              <div className="animate-rise rounded-2xl rounded-tr-sm bg-emerald/20 p-4">
                <p className="label-mono text-cream/70">Doctor · English</p>
                <p className="mt-1.5 text-cream">
                  We'll run a malaria test now. Have you eaten today?
                </p>
              </div>
            </div>
            <p className="mt-6 text-xs text-cream/60">
              Illustrative sample. Every AI output is a draft for clinical review.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-5 py-12 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="font-display text-3xl font-semibold text-teal">{s.value}</p>
              <p className="label-mono mt-2 text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="products" className="mx-auto max-w-6xl px-5 py-20">
        <p className="label-mono text-teal">The platform</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">
          Three products, one shared language layer.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PRODUCTS.map((p) => (
            <article
              key={p.name}
              className="surface p-7 transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-secondary text-teal">
                <p.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-xl font-semibold">{p.name}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{p.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="deep-panel">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="label-mono text-cream/60">Trusted by teams that cannot afford confusion</p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Building2, label: "Teaching hospitals" },
              { icon: Megaphone, label: "Public health NGOs" },
              { icon: Radio, label: "Community radio units" },
              { icon: HeartPulse, label: "Maternal health programmes" },
            ].map((t) => (
              <div key={t.label} className="flex items-center gap-3 rounded-2xl bg-cream/5 p-5">
                <t.icon className="size-5 text-cyan" />
                <span className="text-sm font-medium text-cream">{t.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl bg-cream/10 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-cream">
                Start speaking every patient's language.
              </h2>
              <p className="mt-1.5 text-sm text-cream/70">
                Free to try. No card required for the demo workspace.
              </p>
            </div>
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth">
                Get started <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-lg font-semibold">JOJI</p>
          <p className="text-sm text-muted-foreground">
            Built by MedNova Lifesciences · Lagos, Nigeria
          </p>
        </div>
      </footer>
    </div>
  );
}
