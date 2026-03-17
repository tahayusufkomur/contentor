import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "Is there really a free plan?",
    answer:
      "Yes! Our free plan is free forever — no credit card required. You can have up to 50 students and 3 courses. Upgrade anytime as you grow.",
  },
  {
    question: "Do I need technical skills?",
    answer:
      "Not at all. If you can use social media, you can use Contentor. Everything is drag-and-drop with no coding required.",
  },
  {
    question: "Can I use my own domain?",
    answer:
      "Absolutely. On our Starter plan and above, you can connect your own custom domain. Your students will never see the Contentor brand.",
  },
  {
    question: "How do payments work?",
    answer:
      "We integrate directly with Stripe. Payments go straight to your account — we never hold your money. You can sell one-time courses or recurring subscriptions.",
  },
  {
    question: "What about live class limits?",
    answer:
      "Our Pro plan supports up to 10,000 concurrent students in a single live session. That's WebRTC-powered video with built-in chat and automatic recording.",
  },
  {
    question: "Can I migrate from another platform?",
    answer:
      "Yes. You can import your student list via CSV and recreate your courses easily. Our support team helps with migration for Pro plan users.",
  },
  {
    question: "Is there a long-term contract?",
    answer:
      "No contracts, no commitments. All plans are month-to-month. You can cancel or change plans anytime.",
  },
];

export function FaqSection() {
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-muted-foreground">
            Everything you need to know to get started.
          </p>
        </div>

        <div className="mt-16">
          {faqs.map((faq) => (
            <details key={faq.question} className="group border-b">
              <summary className="flex cursor-pointer items-center justify-between py-5 text-left font-display font-medium transition-colors hover:text-primary">
                {faq.question}
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="faq-content group-open:border-l-2 group-open:border-primary group-open:pl-4">
                <div className="pb-5 text-muted-foreground">{faq.answer}</div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
