import { Badge } from "@/components/ui/badge";

const categories = ["Fitness", "Music", "Dance", "Education", "Wellness"];

export function SocialProofBar() {
  return (
    <section className="border-y bg-brand-surface px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <p className="text-center text-lg text-muted-foreground">
          Trusted by yoga instructors, fitness coaches, music teachers, dance
          academies, and 500+ more creators
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {categories.map((category) => (
            <Badge key={category} variant="brand">
              {category}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
