import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineStep = { label: string; minMs?: number };

/** A small live progress timeline that walks through steps while `active` is true.
 *  Steps advance on a timer; when `active` flips false, all remaining steps complete. */
export function AgentTimeline({
  steps,
  active,
  intervalMs = 700,
}: {
  steps: TimelineStep[];
  active: boolean;
  intervalMs?: number;
}) {
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!active) {
      setDone(steps.length);
      return;
    }
    setDone(0);
    let i = 0;
    const tick = () => {
      i = Math.min(i + 1, steps.length - 1); // never auto-complete last while active
      setDone(i);
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [active, steps.length, intervalMs]);

  return (
    <ol className="space-y-1.5">
      {steps.map((s, idx) => {
        const isDone = idx < done;
        const isCurrent = idx === done && active;
        return (
          <li
            key={s.label}
            className={cn(
              "flex items-center gap-2 text-sm drift-fade-in",
              !isDone && !isCurrent && "opacity-50",
            )}
          >
            <span
              className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center border",
                isDone
                  ? "bg-primary text-primary-foreground border-primary"
                  : isCurrent
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground",
              )}
            >
              {isDone ? (
                <Check className="h-3 w-3" />
              ) : isCurrent ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </span>
            <span className={cn(isCurrent && "drift-shimmer-text")}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export const REFINE_STEPS: TimelineStep[] = [
  { label: "Reading uploaded documents" },
  { label: "Retrieving relevant knowledge" },
  { label: "Understanding existing tasks" },
  { label: "Prioritizing workload" },
  { label: "Generating refined task list" },
  { label: "Updating dashboard" },
];

export const CALENDAR_SYNC_STEPS: TimelineStep[] = [
  { label: "Connecting Google Calendar API" },
  { label: "Fetching calendar events & reminders" },
  { label: "Generating calendar!@#.txt file" },
  { label: "Uploading refreshed file to Knowledge Base" },
  { label: "Running AI refinement pipeline" },
  { label: "Regenerating tasks on dashboard" },
  { label: "Pushing updated events to Google Calendar" },
];

export const GMAIL_SYNC_STEPS: TimelineStep[] = [
  { label: "Connecting Gmail API" },
  { label: "Fetching recent 20 emails" },
  { label: "Generating gmail!@#.txt file" },
  { label: "Uploading refreshed file to Knowledge Base" },
  { label: "Running AI refinement pipeline" },
  { label: "Regenerating tasks on dashboard" },
];

export const UPDATE_ALL_STEPS: TimelineStep[] = [
  { label: "Connecting Google APIs" },
  { label: "Fetching calendar events & reminders" },
  { label: "Fetching recent 20 emails" },
  { label: "Generating calendar!@#.txt & gmail!@#.txt" },
  { label: "Uploading refreshed files to Knowledge Base" },
  { label: "Running AI refinement pipeline" },
  { label: "Regenerating tasks on dashboard" },
  { label: "Pushing updated events to Google Calendar" },
];
