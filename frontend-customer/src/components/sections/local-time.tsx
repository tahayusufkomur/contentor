"use client";

import { useEffect, useState } from "react";
import { formatEventDate, formatEventTime } from "./kit";

/** An event's date and time in the visitor's own time zone. Rendered after
 * mount: the server formats in its zone (UTC), which would not match. */
export function LocalWhen({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(
    () => setText(`${formatEventDate(iso)} · ${formatEventTime(iso)}`),
    [iso],
  );
  return <span>{text || " "}</span>;
}
