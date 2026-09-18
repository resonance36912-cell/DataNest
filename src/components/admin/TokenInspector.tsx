import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TokenInspectorProps {
  /** Raw template text containing {{token}} markers. */
  text: string;
  /** Computed values for known placeholders. */
  values: Record<string, string>;
  label: string;
}

type Part =
  | { kind: "text"; value: string }
  | { kind: "token"; raw: string; key: string; known: boolean };

export function splitTokens(
  text: string,
  values: Record<string, string>,
): Part[] {
  const parts: Part[] = [];
  const re = /\{\{\s*([^}]*?)\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last)
      parts.push({ kind: "text", value: text.slice(last, m.index) });
    const key = m[1];
    parts.push({
      kind: "token",
      raw: m[0],
      key,
      known: Object.prototype.hasOwnProperty.call(values, key),
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return parts;
}

/**
 * Renders template text with each {{token}} highlighted. Hovering or clicking
 * a token reveals the value it expands to for the current build/run.
 */
export default function TokenInspector({
  text,
  values,
  label,
}: TokenInspectorProps) {
  const [pinned, setPinned] = useState<string | null>(null);
  const parts = splitTokens(text, values);
  const tokenCount = parts.filter((p) => p.kind === "token").length;

  return (
    <div className="rounded-md border border-border/60 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {label} — hover or click a token to see its value
        {tokenCount === 0 ? " (no tokens used)" : ""}
      </p>
      <TooltipProvider delayDuration={100}>
        <p className="whitespace-pre-wrap break-words font-mono text-xs leading-6">
          {parts.map((part, i) =>
            part.kind === "text" ? (
              <span key={i} className="text-muted-foreground">
                {part.value}
              </span>
            ) : (
              <Tooltip key={i} open={pinned === `${i}` ? true : undefined}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Preview value for ${part.raw}`}
                    onClick={() =>
                      setPinned((p) => (p === `${i}` ? null : `${i}`))
                    }
                    className={
                      part.known
                        ? "rounded bg-primary/15 px-1 text-primary hover:bg-primary/25"
                        : "rounded bg-destructive/15 px-1 text-destructive hover:bg-destructive/25"
                    }
                  >
                    {part.raw}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {part.known ? (
                    <span className="text-xs">
                      <span className="font-mono">{part.key}</span> →{" "}
                      <span className="font-medium">
                        {values[part.key] || "(empty)"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs">
                      Unknown placeholder — sent literally
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            ),
          )}
        </p>
      </TooltipProvider>
    </div>
  );
}
