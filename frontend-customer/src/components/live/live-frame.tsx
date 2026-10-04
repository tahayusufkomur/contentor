"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clientFetch } from "@/lib/api-client";
import { Spinner } from "@/components/ui/spinner";

// Video lives in LiveCraft (../livecraft). We fetch a join link — Django
// decides who may join and as what — and embed LiveCraft's room UI in an
// iframe. LiveCraft posts {source: "livecraft", type} when the session ends
// for this person, and we take back over.

interface JoinResponse {
  join_url: string;
  role: "host" | "viewer";
}

type Ended = "ended" | "left" | "removed";

interface LiveFrameProps {
  /** e.g. `/api/v1/live/12` — we call `<base>/token/` and, for hosts, `<base>/stop/`. */
  basePath: string;
  /** "class" | "stream" — used in status copy. */
  noun: string;
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center h-screen bg-zinc-950">
      <div className="text-center">{children}</div>
    </div>
  );
}

export default function LiveFrame({ basePath, noun }: LiveFrameProps) {
  const router = useRouter();
  const [join, setJoin] = useState<JoinResponse | null>(null);
  const [error, setError] = useState("");
  const [ended, setEnded] = useState<Ended | null>(null);

  useEffect(() => {
    clientFetch<JoinResponse>(`${basePath}/token/`, { method: "POST" })
      .then(setJoin)
      .catch(() => setError(`Failed to connect to the live ${noun}.`));
  }, [basePath, noun]);

  useEffect(() => {
    if (!join) return;
    const origin = new URL(join.join_url).origin;
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin || e.data?.source !== "livecraft") return;
      const type = e.data.type as Ended;
      // The host ended it inside LiveCraft — mark the session ended here too.
      if (type === "ended" && join?.role === "host") {
        clientFetch(`${basePath}/stop/`, { method: "POST" }).catch(() => {});
      }
      setEnded(type);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [join, basePath]);

  const back = (
    <button
      onClick={() => router.back()}
      className="mt-4 text-sm text-blue-400 underline"
    >
      Go back
    </button>
  );

  if (ended) {
    return (
      <FullScreen>
        <h2 className="text-xl font-bold text-white">
          {ended === "removed"
            ? "You were removed"
            : ended === "left"
              ? `You left the ${noun}`
              : `The ${noun} has ended`}
        </h2>
        {back}
      </FullScreen>
    );
  }
  if (error) {
    return (
      <FullScreen>
        <p className="text-red-400">{error}</p>
        {back}
      </FullScreen>
    );
  }
  if (!join) {
    return (
      <FullScreen>
        <Spinner size="lg" className="text-white" label="Connecting" />
        <p className="mt-4 text-zinc-400">Connecting to live {noun}...</p>
      </FullScreen>
    );
  }

  return (
    <div className="relative h-screen bg-zinc-950">
      <iframe
        src={join.join_url}
        title={`Live ${noun}`}
        allow="camera; microphone; display-capture; fullscreen; autoplay"
        className="h-full w-full border-0"
      />
      {join.join_url.startsWith("about:blank") && (
        <p className="absolute inset-x-0 top-1/2 text-center text-sm text-zinc-400">
          Live video is faked here (LIVECRAFT_URL unset) — run LiveCraft to try
          it for real.
        </p>
      )}
    </div>
  );
}
