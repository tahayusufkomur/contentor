"use client";

import { useState } from "react";
import { Search, Check } from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { searchDomains, formatPrice, type DomainResult } from "@/lib/domains";

function ResultRow({
  r,
  onPick,
}: {
  r: DomainResult;
  onPick: (d: DomainResult) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{r.domain}</p>
        <p className="text-xs text-muted-foreground">
          {r.available
            ? `${formatPrice(r.price_minor, r.currency)} / year`
            : "Taken"}
        </p>
      </div>
      {r.available ? (
        <Button size="sm" variant="brand" onClick={() => onPick(r)}>
          <Check className="h-4 w-4" /> Choose
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">Unavailable</span>
      )}
    </div>
  );
}

export function DomainSearch({
  slug,
  host,
  onPick,
}: {
  slug: string;
  host: string;
  onPick: (d: DomainResult) => void;
}) {
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [suggestions, setSuggestions] = useState<DomainResult[]>([]);
  const [searched, setSearched] = useState(false);

  const { run, loading } = useAsyncAction(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const query = q.trim();
      if (!query) return;
      setError(null);
      const data = await searchDomains(slug, host, query);
      setResults(data.results);
      setSuggestions(data.suggestions);
      setSearched(true);
    },
    {
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Search failed"),
    },
  );

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="yourbrand.com"
          aria-label="Search for a domain"
        />
        <Button type="submit" variant="brand" loading={loading}>
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!loading && searched && (
        <div className="space-y-2">
          {results.map((r) => (
            <ResultRow key={r.domain} r={r} onPick={onPick} />
          ))}
          {suggestions.length > 0 && (
            <>
              <p className="pt-2 text-xs font-medium text-muted-foreground">
                Suggestions
              </p>
              {suggestions.map((r) => (
                <ResultRow key={r.domain} r={r} onPick={onPick} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
