import { TextureOverlay } from "@/components/ui/texture-overlay";

const stats = [
  { value: "$1M+", label: "Earned by creators on Contentor" },
  { value: "10,000+", label: "Students in a single live class" },
  { value: "5 min", label: "Average time to launch" },
];

export function StatsSection() {
  return (
    <section className="relative overflow-hidden bg-foreground px-6 py-24 text-background md:py-32">
      <TextureOverlay opacity={0.04} />
      <div
        className="bg-dot-pattern absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)",
        }}
      />

      <div className="relative z-10 mx-auto grid max-w-4xl gap-8 text-center md:grid-cols-3">
        {stats.map((s) => (
          <div key={s.value}>
            <p className="font-display text-primary text-4xl font-bold tracking-tighter md:text-5xl">
              {s.value}
            </p>
            <p className="mt-2 text-sm text-background/60">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
