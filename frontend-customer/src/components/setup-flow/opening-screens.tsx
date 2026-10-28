"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FileText, Globe } from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { BIO_GUIDE } from "@shared/lib/bio-guide";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import type { QuestionStep } from "@/lib/interview";
import {
  checkSiteName,
  siteNameIdeas,
  type TurnRequest,
} from "@/lib/setup-flow";
import {
  fileProblem,
  SHARE_ACCEPT,
  shareErrorText,
  type ShareDoc,
} from "@/lib/share-doc";
import { siteSlug } from "@/lib/slug";
import { BioHints, BioNudge } from "./bio-hints";
import { BusyOverlay } from "./busy-overlay";
import { QuestionHelp } from "./question-help";

const BIO_MAX = 8000;
const SKIP_BIO = "I'll skip this for now";
// The name is reviewed once typing pauses, so Continue rarely waits. Capped
// per screen: the check endpoint allows 30 a minute per IP.
const REVIEW_DEBOUNCE_MS = 1000;
const REVIEW_MIN_CHARS = 3;
const MAX_REVIEWS = 10;

/** The two screens that open the interview, each on the whole screen: her
 * bio (or skip it), then her site's name, which also makes its address. */
interface ScreenProps {
  step: QuestionStep;
  /** The question being asked now, vs. one the coach went back to. */
  live: boolean;
  sending: boolean;
  onSend: (req: TurnRequest) => void;
  /** Move on without answering again. */
  onNext: () => void;
  dir: "next" | "back";
}

/** The question's words landing one by one, under the guide's ack (or her
 * earlier answer), with why it matters and its ⓘ. */
function Heading({ step, live }: { step: QuestionStep; live: boolean }) {
  const words = step.question.split(/\s+/).filter(Boolean);
  return (
    <>
      {live && step.ack && (
        <p className="max-w-[72ch] text-[16px] leading-relaxed text-[var(--sf-graphite)] motion-safe:animate-[sf-rise_.5s_ease-out_both]">
          {step.ack}
        </p>
      )}
      {!live && step.answer && (
        <p className="max-w-[72ch] text-[15px] text-[var(--sf-graphite)]">
          You said: <span className="text-[var(--sf-ink)]">{step.answer}</span>
        </p>
      )}
      <h1 className="mt-3 max-w-[32ch] text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[42px]">
        {words.map((w, i) => (
          <Fragment key={i}>
            <span
              className="inline-block motion-safe:animate-[sf-word_.8s_var(--sf-spring)_both]"
              style={{ animationDelay: `${120 + Math.min(i, 16) * 42}ms` }}
            >
              {w}
            </span>{" "}
          </Fragment>
        ))}
      </h1>
      {step.why && (
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--sf-graphite)]">
          {step.why}
        </p>
      )}
      <QuestionHelp help={step.help} />
    </>
  );
}

const answersAt = (step: QuestionStep) =>
  160 + Math.min(step.question.split(/\s+/).length, 16) * 42;

function Slide({
  dir,
  children,
}: {
  dir: "next" | "back";
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[880px] flex-1 flex-col justify-center px-5 py-8 sm:px-10">
        <div
          className={
            dir === "back"
              ? "motion-safe:animate-[sf-slide-back_.6s_var(--sf-spring)_.1s_both]"
              : "motion-safe:animate-[sf-slide-next_.6s_var(--sf-spring)_.1s_both]"
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Her bio, CV or old About page, as a file or written here: read once, and
 * what it says is ticked in the questions ahead for her to check. Failures
 * show here, in place; success moves on to the next question. */
export function BioScreen({
  onShare,
  ...props
}: ScreenProps & { onShare: (doc: ShareDoc) => Promise<void> }) {
  const { step, live, sending, onSend, onNext, dir } = props;
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const { run: share, loading } = useAsyncAction(
    async () => {
      setError("");
      await onShare(file ? { file } : { text });
    },
    { onError: (err) => setError(shareErrorText(err)) },
  );
  const pick = (picked: File | null) => {
    const problem = picked ? fileProblem(picked) : null;
    setError(problem ?? "");
    setFile(problem ? null : picked);
    if (problem && input.current) input.current.value = "";
  };
  const busy = sending || loading;

  return (
    <Slide dir={dir}>
      <Heading step={step} live={live} />
      <form
        aria-busy={loading}
        className="mt-8 flex flex-col gap-4 motion-safe:animate-[sf-rise_.6s_ease-out_both]"
        style={{ animationDelay: `${answersAt(step)}ms` }}
        onSubmit={(e) => {
          e.preventDefault();
          if (file || text.trim()) void share();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            id="setup-bio-file"
            type="file"
            accept={SHARE_ACCEPT}
            aria-label="Choose a file"
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="rounded-full"
          >
            <FileText className="size-4" aria-hidden />
            {file ? "Choose another file" : "Add a file"}
          </Button>
          {file ? (
            <>
              <span className="truncate text-[14px] text-[var(--sf-ink)]">
                {file.name}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => pick(null)}
                className="text-[13.5px] font-medium text-[var(--sf-graphite)] underline underline-offset-2 hover:text-[var(--sf-ink)] disabled:opacity-50"
              >
                Write it instead
              </button>
            </>
          ) : (
            <span className="text-[13.5px] text-[var(--sf-graphite)]">
              PDF, text or Markdown, up to 5 MB. Or write it below.
            </span>
          )}
        </div>
        {!file && (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="setup-bio-text"
              className="text-[15px] font-medium text-[var(--sf-ink)]"
            >
              {BIO_GUIDE.label}
            </label>
            <BioHints />
            <textarea
              id="setup-bio-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError("");
              }}
              disabled={busy}
              rows={8}
              maxLength={BIO_MAX}
              placeholder={BIO_GUIDE.placeholder}
              className="mt-1 block min-h-[200px] w-full resize-y rounded-xl border border-[var(--sf-line-strong)] bg-white px-3 py-2.5 text-[15px] leading-relaxed outline-none transition-[border-color,box-shadow] focus:border-[var(--sf-ink)] focus:shadow-[0_0_0_3px_var(--sf-brass-soft)] disabled:opacity-50"
            />
            <div className="flex items-start gap-3">
              <BioNudge text={text} />
              <span className="ml-auto shrink-0 text-[12px] text-[var(--sf-faint)]">
                {text.length} / {BIO_MAX}
              </span>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-[13.5px] text-destructive">
            {error}
          </p>
        )}
        <div className="flex min-h-11 flex-wrap items-center gap-2">
          <Button
            type="submit"
            size="lg"
            loading={loading}
            loadingText="Reading it…"
            disabled={busy || (!file && !text.trim())}
            className="rounded-full px-6"
          >
            Continue
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={busy}
            onClick={() =>
              live || !step.answer
                ? onSend({
                    message: SKIP_BIO,
                    choice: { field: "bio", value: "none" },
                  })
                : onNext()
            }
            className="rounded-full text-[var(--sf-graphite)]"
          >
            {live || !step.answer ? "Skip for now" : "Leave it as it is"}
          </Button>
        </div>
      </form>
      {/* Reading takes a while and ticks the questions ahead. */}
      {loading && (
        <ModalPortal>
          <BusyOverlay
            variant="screen"
            message="Reading what you shared…"
            hint="I tick what it answers in the questions ahead, so you only check them. This can take a little while."
          />
        </ModalPortal>
      )}
    </Slide>
  );
}

type Review = { name: string; typo: string; suggestions: string[] };

/** Her site's name, which also makes its web address (<name>.<domain>). The
 * name is checked as she types: taken names are refused here, and an AI typo
 * fix or a few alternatives are offered once (Continue again keeps hers).
 * "Need a name?" offers ideas. Sending it moves the site to its address. */
export function NameScreen({
  host,
  ...props
}: ScreenProps & {
  /** The site's address now: its temporary one until it is named. */
  host: string;
}) {
  const { step, live, sending, onSend, onNext, dir } = props;
  const dot = host.indexOf(".");
  const here = host.slice(0, dot);
  const domain = host.slice(dot + 1);
  const [name, setName] = useState(live ? "" : (step.answer ?? ""));
  const [error, setError] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [kept, setKept] = useState(false);
  const checks = useRef(new Map<string, ReturnType<typeof checkSiteName>>());
  const slug = siteSlug(name);
  const unchanged = slug === here;

  // One check per name: in the background once typing pauses, then reused.
  const check = useCallback((n: string) => {
    let pending = checks.current.get(n);
    if (!pending) {
      pending = checkSiteName(n);
      checks.current.set(n, pending);
    }
    return pending;
  }, []);
  useEffect(() => {
    const n = name.trim();
    if (n.length < REVIEW_MIN_CHARS || unchanged) return;
    if (checks.current.size >= MAX_REVIEWS) return;
    const t = setTimeout(() => {
      check(n)
        .then((r) => {
          if (!r.available) setError(r.detail ?? "That name is taken.");
        })
        .catch(() => undefined);
    }, REVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [name, unchanged, check]);

  const send = (n: string) =>
    onSend({
      message: n,
      choice: { field: "site_name", value: n },
      ...(live ? {} : { field: "site_name" }),
    });
  const { run: proceed, loading: checking } = useAsyncAction(
    async () => {
      const n = name.trim();
      if (!live && n === step.answer) return onNext();
      if (unchanged || kept) return send(n);
      const r = await check(n);
      if (!r.available) return setError(r.detail ?? "That name is taken.");
      const typo = r.typo_fix ?? "";
      const suggestions = r.suggestions ?? [];
      if (typo || suggestions.length) {
        setReview({ name: n, typo, suggestions });
        setKept(true); // a second Continue keeps her name
        return;
      }
      send(n);
    },
    // A check that fails never blocks her: the server checks again on send.
    { onError: () => send(name.trim()) },
  );
  const use = (n: string) => {
    setName(n);
    setReview(null);
    setKept(false);
    setError("");
  };
  const busy = sending || checking;

  return (
    <Slide dir={dir}>
      <Heading step={step} live={live} />
      <form
        className="mt-8 max-w-[560px] motion-safe:animate-[sf-rise_.6s_ease-out_both]"
        style={{ animationDelay: `${answersAt(step)}ms` }}
        onSubmit={(e) => {
          e.preventDefault();
          if (slug && !busy) void proceed();
        }}
      >
        <label
          htmlFor="setup-site-name"
          className="text-[15px] font-medium text-[var(--sf-ink)]"
        >
          Your site&rsquo;s name
        </label>
        <input
          id="setup-site-name"
          value={name}
          onChange={(e) => use(e.target.value)}
          disabled={busy}
          maxLength={100}
          placeholder="Mira Yoga House, or just your name"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          autoFocus={live}
          className="mt-2 block w-full rounded-xl border border-[var(--sf-line-strong)] bg-white px-4 py-3 text-[18px] outline-none transition-[border-color,box-shadow] focus:border-[var(--sf-ink)] focus:shadow-[0_0_0_3px_var(--sf-brass-soft)] disabled:opacity-50"
        />
        {/* The address the name makes, and that it need not stay the last word. */}
        <div className="mt-3 flex gap-2.5 rounded-xl border border-[var(--sf-line)] bg-[var(--sf-paper)] p-3.5 text-[14px] leading-relaxed text-[var(--sf-graphite)]">
          <Globe
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-[var(--sf-brass)]"
          />
          <p>
            Your web address:{" "}
            <span className="font-medium text-[var(--sf-ink)]">
              {slug || "yourname"}.{domain}
            </span>
            . It&rsquo;s free and yours to keep. Later, you can get your own
            domain, like yourname.com, from your dashboard, and your site moves
            to it.
          </p>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-[13.5px] text-destructive">
            {error}
          </p>
        )}
        {review && review.name === name.trim() && (
          <div className="mt-4 space-y-3 text-[14px] motion-safe:animate-fade-in">
            {review.typo && (
              <p className="text-[var(--sf-graphite)]">
                Did you mean{" "}
                <button
                  type="button"
                  onClick={() => use(review.typo)}
                  className="font-semibold text-[var(--sf-ink)] underline underline-offset-2"
                >
                  {review.typo}
                </button>
                ?
              </p>
            )}
            {review.suggestions.length > 0 && (
              <NameChips
                label="Or one of these:"
                names={review.suggestions}
                onPick={use}
              />
            )}
            <p className="text-[13.5px] text-[var(--sf-graphite)]">
              Pick one, or press Continue to keep your name as it is.
            </p>
          </div>
        )}
        <div className="mt-6 flex min-h-11 flex-wrap items-center gap-2">
          <Button
            type="submit"
            size="lg"
            loading={checking}
            loadingText="Checking your name…"
            disabled={busy || !slug}
            className="rounded-full px-6"
          >
            Continue
          </Button>
        </div>
      </form>
      <NameIdeas disabled={busy} onPick={use} />
      {sending && (
        <ModalPortal>
          <BusyOverlay
            variant="screen"
            message={`Moving your site to ${slug}.${domain}…`}
            hint="Your site opens at its new address in a moment, right where you left off."
          />
        </ModalPortal>
      )}
    </Slide>
  );
}

function NameChips({
  label,
  names,
  onPick,
}: {
  label: string;
  names: string[];
  onPick: (name: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[13.5px] text-[var(--sf-graphite)]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {names.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className="rounded-full border border-[var(--sf-line-strong)] bg-white px-3.5 py-1.5 text-[14px] transition-colors hover:border-[var(--sf-ink)]"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Need a name?": a few free names for what she offers. */
function NameIdeas({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [firstName, setFirstName] = useState("");
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const { run: get, loading } = useAsyncAction(
    async () => setIdeas(await siteNameIdeas(topic.trim(), firstName.trim())),
    { onError: () => setIdeas([]) },
  );
  const box =
    "mt-1.5 block w-full rounded-xl border border-[var(--sf-line-strong)] bg-white px-3 py-2.5 text-[15px] outline-none focus:border-[var(--sf-ink)] focus:shadow-[0_0_0_3px_var(--sf-brass-soft)]";

  if (!open)
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="mt-5 text-[14px] font-medium text-[var(--sf-graphite)] underline underline-offset-2 hover:text-[var(--sf-ink)] disabled:opacity-50"
      >
        Need a name? Get ideas
      </button>
    );
  return (
    <form
      className="mt-6 max-w-[560px] space-y-3 rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-paper)] p-4 motion-safe:animate-fade-in"
      onSubmit={(e) => {
        e.preventDefault();
        if (topic.trim() && !loading) void get();
      }}
    >
      <div>
        <label htmlFor="setup-name-topic" className="text-[14px] font-medium">
          What do you offer?
        </label>
        <input
          id="setup-name-topic"
          value={topic}
          maxLength={120}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Yoga for runners"
          autoComplete="off"
          className={box}
        />
      </div>
      <div>
        <label htmlFor="setup-name-first" className="text-[14px] font-medium">
          Your first name (optional)
        </label>
        <input
          id="setup-name-first"
          value={firstName}
          maxLength={40}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="off"
          className={box}
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        loading={loading}
        loadingText="Thinking of names…"
        disabled={disabled || !topic.trim()}
        className="rounded-full"
      >
        Get ideas
      </Button>
      {ideas?.length === 0 && (
        <p className="text-[13.5px] text-[var(--sf-graphite)]">
          I couldn&rsquo;t think of names just now. Try again in a moment.
        </p>
      )}
      {ideas && ideas.length > 0 && (
        <NameChips label="Tap one to use it:" names={ideas} onPick={onPick} />
      )}
    </form>
  );
}
