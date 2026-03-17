const testimonials = [
  {
    quote:
      "Contentor made it incredibly easy to launch my yoga course platform. I was earning within a week.",
    name: "Sarah Chen",
    role: "Yoga Instructor",
    bg: "bg-brand-surface",
  },
  {
    quote:
      "The live class feature is a game-changer. I can teach 500+ students at once without any technical issues.",
    name: "Marcus Johnson",
    role: "Fitness Coach",
    bg: "bg-primary/5",
  },
  {
    quote:
      "Having my own branded platform instead of being on a marketplace made all the difference for my business.",
    name: "Priya Sharma",
    role: "Dance Academy",
    bg: "bg-accent/5",
  },
];

export function TestimonialsSection() {
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-center text-3xl font-bold tracking-tight md:text-4xl">
          Creators love Contentor
        </h2>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className={`relative rounded-xl border ${t.bg} p-6 shadow-sm ${i === 1 ? "md:mt-8" : ""}`}
            >
              <span className="absolute -top-2 -left-1 text-6xl font-display text-primary/10 select-none">
                &ldquo;
              </span>
              <p className="italic text-muted-foreground">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="mt-6 flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-primary/60 to-accent/60" />
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
