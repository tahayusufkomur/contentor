const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

export function Linkify({ text }: { text: string }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {text.split(URL_RE).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </span>
  );
}
