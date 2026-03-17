const steps = [
  {
    number: "1",
    title: "Create your free account",
    description: "Sign up in under 2 minutes. No credit card required.",
  },
  {
    number: "2",
    title: "Upload your content",
    description: "Add courses, set your prices, and customize your brand.",
  },
  {
    number: "3",
    title: "Start earning",
    description: "Share your link and watch the revenue come in.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="px-6 py-32 md:py-40">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-display text-center text-3xl font-bold tracking-tight md:text-4xl">
          Up and running in minutes
        </h2>

        <div className="relative mt-20 grid gap-8 md:grid-cols-3">
          <div className="absolute left-0 right-0 top-8 hidden h-px border-t border-primary/30 md:block" />

          {steps.map((step) => (
            <div key={step.number} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-background">
                <span className="font-display text-xl font-bold">
                  {step.number}
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
