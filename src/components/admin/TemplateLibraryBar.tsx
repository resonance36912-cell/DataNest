import { useEffect, useState } from "react";
import { Check, Copy, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportEmailTemplate } from "@/lib/report-email-template";
import {
  createTemplate,
  deleteTemplate,
  getActiveTemplateId,
  listTemplates,
  renameTemplate,
  setActiveTemplateId,
  updateTemplate,
  type SavedEmailTemplate,
} from "@/lib/report-email-template-library";

interface TemplateLibraryBarProps {
  /** Current editor content. */
  current: ReportEmailTemplate;
  /** Called when a saved template is loaded into the editor. */
  onLoad: (tpl: ReportEmailTemplate) => void;
}

/** Saved named templates with quick switching, save, rename and delete. */
export default function TemplateLibraryBar({
  current,
  onLoad,
}: TemplateLibraryBarProps) {
  const [items, setItems] = useState<SavedEmailTemplate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    setItems(listTemplates());
    setActiveId(getActiveTemplateId());
  }, []);

  const active = items.find((i) => i.id === activeId) ?? null;

  const startSaveAs = () => {
    setRenaming(false);
    setNameDraft(active ? `${active.name} copy` : "Default report");
    setNaming(true);
  };

  const startRename = () => {
    if (!active) return;
    setRenaming(true);
    setNameDraft(active.name);
    setNaming(true);
  };

  const confirmName = () => {
    if (renaming && active) {
      setItems(renameTemplate(active.id, nameDraft));
      toast.success("Template renamed");
    } else {
      const { list, entry } = createTemplate(nameDraft, current);
      setItems(list);
      setActiveId(entry.id);
      toast.success(`Saved “${entry.name}”`);
    }
    setNaming(false);
    setRenaming(false);
  };

  const handleSelect = (id: string) => {
    const found = items.find((i) => i.id === id);
    if (!found) return;
    setActiveId(id);
    setActiveTemplateId(id);
    onLoad(found.template);
    toast.success(`Switched to “${found.name}”`);
  };

  const handleUpdate = () => {
    if (!active) return;
    setItems(updateTemplate(active.id, current));
    toast.success(`Updated “${active.name}”`);
  };

  const handleDelete = () => {
    if (!active) return;
    const list = deleteTemplate(active.id);
    setItems(list);
    setActiveId(getActiveTemplateId());
    toast.success(`Deleted “${active.name}”`);
  };

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Saved templates
        </span>
        <Select value={activeId ?? undefined} onValueChange={handleSelect}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue
              placeholder={
                items.length ? "Choose a template" : "No saved templates yet"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.id} value={i.id} className="text-xs">
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={startSaveAs}
        >
          {items.length ? (
            <Copy className="mr-1 h-3.5 w-3.5" />
          ) : (
            <Plus className="mr-1 h-3.5 w-3.5" />
          )}
          Save as…
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!active}
          onClick={handleUpdate}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          Update
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          disabled={!active}
          onClick={startRename}
        >
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Rename
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-destructive hover:text-destructive"
          disabled={!active}
          onClick={handleDelete}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
      {naming && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmName();
              if (e.key === "Escape") setNaming(false);
            }}
            placeholder="Template name"
            className="h-8 w-56 text-xs"
          />
          <Button size="sm" className="h-8 text-xs" onClick={confirmName}>
            <Check className="mr-1 h-3.5 w-3.5" />
            {renaming ? "Rename" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setNaming(false)}
          >
            Cancel
          </Button>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Switching loads that template into the editor below and uses it for test
        and automatic sends.
      </p>
    </div>
  );
}
