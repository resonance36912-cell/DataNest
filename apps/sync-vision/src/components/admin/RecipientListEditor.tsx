import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, Trash2, Users } from "lucide-react";
import {
  MAX_RECIPIENTS,
  addRecipient,
  clearRecipients,
  loadRecipients,
  removeRecipient,
  selectedRecipients,
  setAllSelected,
  toggleRecipient,
  type Recipient,
} from "@/lib/report-recipients";

interface Props {
  /** Notified whenever the selected set changes, e.g. to enable a send action. */
  onChange?: (selected: Recipient[]) => void;
}

/**
 * Saved recipient list for exported checklist PDFs. Add, remove and pick which
 * addresses receive the report. Stored on this device only.
 */
const RecipientListEditor = ({ onChange }: Props) => {
  const [list, setList] = useState<Recipient[]>([]);
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initial = loadRecipients();
    setList(initial);
    onChange?.(selectedRecipients(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (next: Recipient[]) => {
    setList(next);
    onChange?.(selectedRecipients(next));
  };

  const handleAdd = () => {
    const result = addRecipient(list, email, label);
    setError(result.error);
    if (!result.error) {
      apply(result.list);
      setEmail("");
      setLabel("");
    }
  };

  const chosen = selectedRecipients(list).length;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" /> Report recipients
            </CardTitle>
            <CardDescription className="mt-1">
              Addresses that receive the exported checklist PDF. Saved on this device only (up to{" "}
              {MAX_RECIPIENTS}).
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0">
            {chosen}/{list.length} selected
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="recipient-email">Email address</Label>
            <Input
              id="recipient-email"
              type="email"
              placeholder="ops@syncvision.life"
              value={email}
              maxLength={255}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recipient-label">Label (optional)</Label>
            <Input
              id="recipient-label"
              placeholder="Deploy notes"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No recipients saved yet.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border rounded-lg border border-border">
              {list.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={`recipient-${r.id}`}
                    checked={r.selected}
                    onCheckedChange={() => apply(toggleRecipient(list, r.id))}
                  />
                  <label
                    htmlFor={`recipient-${r.id}`}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 truncate text-sm">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{r.email}</span>
                    </span>
                    {r.label && (
                      <span className="block truncate text-xs text-muted-foreground">{r.label}</span>
                    )}
                  </label>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${r.email}`}
                    onClick={() => apply(removeRecipient(list, r.id))}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => apply(setAllSelected(list, true))}>
                Select all
              </Button>
              <Button size="sm" variant="outline" onClick={() => apply(setAllSelected(list, false))}>
                Deselect all
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => apply(clearRecipients())}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove all
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default RecipientListEditor;
