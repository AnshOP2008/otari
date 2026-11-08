import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2, Calendar, Sparkles, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

export type Task = {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  tags: string[];
  status: "todo" | "done";
  position: number;
  due_date: string | null;
  created_by: "user" | "ai";
  ai_reason: string | null;
  created_at?: string;
  updated_at?: string;
};

const priorityStyles: Record<Task["priority"], string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export function TaskCard({
  task,
  onToggle,
  onEdit,
  onDelete,
  pastMode = false,
}: {
  task: Task;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  pastMode?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: pastMode,
  });
  const [showReason, setShowReason] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [pressed, setPressed] = useState(false);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || pressed ? 0.5 : 1,
  };

  if (pastMode) {
    return (
      <div className="card-soft p-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium line-through opacity-70">{task.title}</div>
          {task.due_date && (
            <div className="text-xs text-muted-foreground">
              Due {format(parseISO(task.due_date), "MMM d")}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => onDelete(task)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "card-soft p-3 transition-shadow",
        task.status === "done" && "opacity-60",
        task.created_by === "ai" && "border-l-2 border-l-primary",
      )}
    >
      <div className="flex items-start gap-2">
        {/* <button
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          aria-label="Drag"
        >
          <GripVertical className="h-4 w-4" />
        </button> */}
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab active:cursor-grabbing text-xs font-medium text-muted-foreground hover:text-foreground touch-none"
          aria-label="Drag"
          onPointerDown={(e) => {
            listeners?.onPointerDown?.(e); // let dnd-kit handle it
            setPressed(true);
          }}
          onPointerUp={() => setPressed(false)}
          onPointerCancel={() => setPressed(false)}
        >
          Drag
        </button>
        <Checkbox
          checked={task.status === "done"}
          onCheckedChange={() => onToggle(task)}
          className="mt-1"
        ></Checkbox>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cn("font-medium", task.status === "done" && "line-through")}>
              {task.title}
            </h3>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full border capitalize",
                priorityStyles[task.priority],
              )}
            >
              {task.priority}
            </span>
            {task.created_by === "ai" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI
              </span>
            )}
          </div>
          {task.description && (
            <>
              <button
                onClick={() => setShowDescription((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline md:hidden"
              >
                Description
                <ChevronDown
                  className={cn("h-3 w-3 transition", showDescription && "rotate-180")}
                />
              </button>

              <p className="mt-1 hidden text-sm text-muted-foreground md:block">
                {task.description}
              </p>

              {showDescription && (
                <div className="mt-2 rounded-md border border-border bg-accent/50 p-2 text-xs md:hidden">
                  {task.description}
                </div>
              )}
            </>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {task.due_date && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" /> {format(parseISO(task.due_date), "MMM d")}
              </span>
            )}
            {task.tags.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-full bg-sand text-foreground/70 border border-border"
              >
                {t}
              </span>
            ))}
          </div>
          {task.ai_reason && (
            <button
              onClick={() => setShowReason((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Sparkles className="h-3 w-3" /> AI reasoning
              <ChevronDown className={cn("h-3 w-3 transition", showReason && "rotate-180")} />
            </button>
          )}
          {showReason && task.ai_reason && (
            <div className="mt-2 text-xs bg-accent/50 rounded-md p-2 border border-border drift-fade-in space-y-1">
              <div>{task.ai_reason}</div>
              {task.created_by === "ai" && (task.created_at || task.updated_at) && (
                <div className="text-muted-foreground pt-1 border-t border-border">
                  {task.created_at && (
                    <div>AI generated {format(parseISO(task.created_at), "MMM d, h:mm a")}</div>
                  )}
                  {task.updated_at && task.updated_at !== task.created_at && (
                    <div>Last refined {format(parseISO(task.updated_at), "MMM d, h:mm a")}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => onEdit(task)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(task)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
