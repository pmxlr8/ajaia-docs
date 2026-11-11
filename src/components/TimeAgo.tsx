"use client";

import { useEffect, useState } from "react";

function format(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Relative time, rendered on the client so it uses the viewer's clock and time zone. */
export function TimeAgo({ iso }: { iso: string }) {
  const [label, setLabel] = useState<{ short: string; full: string } | null>(null);
  useEffect(() => {
    const update = () => setLabel({ short: format(iso), full: new Date(iso).toLocaleString() });
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [iso]);
  return (
    <time dateTime={iso} title={label?.full}>
      {label?.short ?? " "}
    </time>
  );
}
