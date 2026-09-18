import { useCallback, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PLACEHOLDER_HELP } from "@/lib/report-email-template";

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
}

interface Token {
  /** Index of the opening "{{". */
  start: number;
  /** Caret index (end of the typed query). */
  end: number;
  query: string;
}

/** Find an open "{{query" token immediately before the caret. */
export function findOpenToken(text: string, caret: number): Token | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("{{");
  if (start === -1) return null;
  const query = before.slice(start + 2);
  if (query.includes("}") || query.includes("{") || /\s/.test(query)) return null;
  if (query.length > 24) return null;
  return { start, end: caret, query };
}

/**
 * Text field with inline autocomplete for known report placeholders.
 * Typing "{{" opens a filtered list; Enter/Tab or click inserts "{{key}}".
 */
export default function PlaceholderField({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  multiline,
  rows,
}: Props) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [token, setToken] = useState<Token | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (!token) return [];
    const q = token.query.toLowerCase();
    return PLACEHOLDER_HELP.filter((p) =>
      p.key.toLowerCase().startsWith(q),
    ).slice(0, 6);
  }, [token]);

  const open = matches.length > 0;

  const sync = useCallback((el: HTMLInputElement | HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? el.value.length;
    setToken(findOpenToken(el.value, caret));
    setActive(0);
  }, []);

  const insert = useCallback(
    (key: string) => {
      if (!token) return;
      const next = `${value.slice(0, token.start)}{{${key}}}${value.slice(token.end)}`;
      onChange(next);
      setToken(null);
      const caret = token.start + key.length + 4;
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [token, value, onChange],
  );

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insert(matches[active].key);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setToken(null);
    }
  };

  const shared = {
    id,
    value,
    placeholder,
    className,
    onKeyDown: handleKeyDown,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      onChange(e.target.value);
      sync(e.target);
    },
    onClick: (
      e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => sync(e.currentTarget),
    onKeyUp: (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => sync(e.currentTarget),
    onBlur: () => {
      // Delay so a click on a suggestion still registers.
      window.setTimeout(() => setToken(null), 150);
      onBlur?.();
    },
  };

  return (
    <div className="relative">
      {multiline ? (
        <Textarea
          {...shared}
          rows={rows}
          ref={ref as React.Ref<HTMLTextAreaElement>}
        />
      ) : (
        <Input {...shared} ref={ref as React.Ref<HTMLInputElement>} />
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          {matches.map((m, i) => (
            <button
              key={m.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(m.key)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-xs transition-colors ${
                i === active ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              <span className="font-mono">{`{{${m.key}}}`}</span>
              <span className="truncate text-muted-foreground">
                {m.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
