import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  CalendarClock,
  ChevronDown,
  FileText,
  Flame,
  ListTodo,
  Loader2,
  MessageCircle,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { AgentTimeline, REFINE_STEPS } from "@/components/ai/agent-timeline";
import { TaskCard, type Task } from "@/components/tasks/task-card";
import { TaskEditor, type TaskDraft } from "@/components/tasks/task-editor";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTaskSummary, refineTasksWithAI } from "@/lib/ai.functions";
import { createTask, deleteTask, listTasks, reorderTasks, updateTask } from "@/lib/tasks.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Tasks - TaskBase" },
      { name: "description", content: "Your AI-assisted task workspace." },
    ],
  }),
  component: HomePage,
});

type Section = "all" | "today" | "week" | "month" | "past";

function isPast(task: Task) {
  if (!task.due_date) {
    return false;
  }

  return isBefore(parseISO(task.due_date), startOfDay(new Date())) && task.status !== "done";
}

function filterTasks(tasks: Task[], section: Section): Task[] {
  if (section === "all") {
    return tasks.filter((task) => !isPast(task));
  }

  if (section === "past") {
    return tasks.filter((task) => isPast(task));
  }

  const now = new Date();
  const ranges = {
    today: { start: startOfDay(now), end: endOfDay(now) },
    week: { start: startOfWeek(now), end: endOfWeek(now) },
    month: { start: startOfMonth(now), end: endOfMonth(now) },
  } as const;

  return tasks.filter((task) => {
    if (!task.due_date || isPast(task)) {
      return false;
    }

    return isWithinInterval(parseISO(task.due_date), ranges[section]);
  });
}

function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useServerFn(listTasks);
  const create = useServerFn(createTask);
  const update = useServerFn(updateTask);
  const remove = useServerFn(deleteTask);
  const reorder = useServerFn(reorderTasks);
  const refine = useServerFn(refineTasksWithAI);
  const summarize = useServerFn(getTaskSummary);

  const [section, setSection] = useState<Section>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [lastRefineSummary, setLastRefineSummary] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => list(),
  });

  const summaryQuery = useQuery({
    queryKey: ["task-summary"],
    queryFn: () => summarize(),
    enabled: false,
  });

  const tasks = (tasksQuery.data ?? []) as Task[];
  const visible = useMemo(() => filterTasks(tasks, section), [tasks, section]);

  const activeTasks = useMemo(() => tasks.filter((task) => !isPast(task)), [tasks]);
  const overallCompletion = useMemo(() => {
    if (activeTasks.length === 0) {
      return 0;
    }

    return Math.round(
      (activeTasks.filter((task) => task.status === "done").length / activeTasks.length) * 100,
    );
  }, [activeTasks]);

  const sectionCompletion = useMemo(() => {
    if (visible.length === 0) {
      return 0;
    }

    return Math.round(
      (visible.filter((task) => task.status === "done").length / visible.length) * 100,
    );
  }, [visible]);

  const topPriorities = useMemo(
    () =>
      tasks
        .filter((task) => task.status !== "done" && !isPast(task))
        .sort((a, b) => {
          const score = (task: Task) =>
            task.priority === "high" ? 0 : task.priority === "medium" ? 1 : 2;
          return score(a) - score(b);
        })
        .slice(0, 3),
    [tasks],
  );

  const upcoming = useMemo(
    () =>
      tasks
        .filter((task) => task.status !== "done" && task.due_date && !isPast(task))
        .sort((a, b) => parseISO(a.due_date!).getTime() - parseISO(b.due_date!).getTime())
        .slice(0, 3),
    [tasks],
  );

  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["task-summary"] });
  };

  const createMut = useMutation({
    mutationFn: (draft: TaskDraft) => create({ data: draft }),
    onSuccess: () => {
      invalidateTasks();
      toast.success("Task added");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const updateMut = useMutation({
    mutationFn: (draft: Partial<TaskDraft> & { id: string; status?: Task["status"] }) =>
      update({ data: draft }),
    onSuccess: () => {
      invalidateTasks();
      toast.success("Task updated");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      invalidateTasks();
      toast.success("Task deleted");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) => reorder({ data: { orderedIds } }),
    onSuccess: invalidateTasks,
    onError: (error) => toast.error((error as Error).message),
  });

  const refineMut = useMutation({
    mutationFn: async () => {
      console.log("[Home] Starting plain task refinement workflow");
      toast.info("Analyzing tasks and documents...");
      return await refine();
    },
    onSuccess: (result) => {
      invalidateTasks();
      const parts: string[] = [];
      if (result.changes.added) parts.push(`${result.changes.added} added`);
      if (result.changes.removed) parts.push(`${result.changes.removed} removed`);
      parts.push(`${result.count} total`);
      toast.success(`Tasks updated: ${parts.join(", ")}`, {
        description: result.summary,
        duration: 6000,
      });
      setLastRefineSummary(result.summary);
      setSummaryOpen(true);
      summaryQuery.refetch();
    },
    onError: (error) => {
      console.error("[Home] Refine tasks error:", error);
      toast.error((error as Error).message);
    },
  });

  const isBusy = refineMut.isPending;
  const busyLabel = isBusy ? "Finding tasks supported by your sources…" : "";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = visible.findIndex((task) => task.id === active.id);
    const newIndex = visible.findIndex((task) => task.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const nextVisible = arrayMove(visible, oldIndex, newIndex);
    const visibleIds = new Set(nextVisible.map((task) => task.id));
    const merged = [...nextVisible, ...tasks.filter((task) => !visibleIds.has(task.id))];
    queryClient.setQueryData(["tasks"], merged);
    reorderMut.mutate(merged.map((task) => task.id));
  };

  const handleSubmit = async (draft: TaskDraft) => {
    if (editing) {
      await updateMut.mutateAsync({ ...draft, id: editing.id });
      return;
    }

    await createMut.mutateAsync(draft);
  };

  const toggleTask = (task: Task) => {
    updateMut.mutate({
      id: task.id,
      status: task.status === "done" ? "todo" : "done",
    });
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan your work, edit tasks by hand, or find new tasks in your sources.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isBusy} className="w-full sm:w-auto">
                {isBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Refine
                <ChevronDown className="ml-1.5 h-4 w-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border-border">
              <DropdownMenuItem
                onClick={() => refineMut.mutate()}
                disabled={isBusy}
                className="flex items-center gap-2 cursor-pointer focus:bg-secondary"
              >
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <span>Find New Tasks</span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/permissions">Google integrations</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
            disabled={isBusy}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add task
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryPanel icon={ListTodo} label="Workload">
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">
              {activeTasks.filter((task) => task.status !== "done").length}
            </span>
            <span className="text-sm text-muted-foreground">active</span>
          </div>
          <Progress value={overallCompletion} className="mt-3 h-2" />
          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
            {overallCompletion}% complete
          </div>
        </SummaryPanel>

        <SummaryPanel icon={Flame} label="Top priorities">
          {topPriorities.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No high-priority tasks right now.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {topPriorities.map((task) => (
                <li key={task.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span className="truncate">{task.title}</span>
                </li>
              ))}
            </ul>
          )}
        </SummaryPanel>

        <SummaryPanel icon={CalendarClock} label="Upcoming">
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No scheduled work.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {upcoming.map((task) => (
                <li
                  key={task.id}
                  className="flex min-w-0 items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate">{task.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(parseISO(task.due_date!), "MMM d")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SummaryPanel>
      </div>

      <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen} className="mt-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <CollapsibleTrigger
            onClick={() => {
              if (!summaryOpen && !summaryQuery.data) {
                summaryQuery.refetch();
              }
            }}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span className="font-medium">Assistant summary</span>
              {isBusy && (
                <span className="text-xs text-muted-foreground">
                  {busyLabel || "updating tasks..."}
                </span>
              )}
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition ${summaryOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            {isBusy ? (
              <AgentTimeline steps={REFINE_STEPS} active />
            ) : (
              <div className="text-sm text-muted-foreground">
                {lastRefineSummary ??
                  summaryQuery.data?.summary ??
                  (summaryQuery.isFetching
                    ? "Generating summary..."
                    : "Use Refine to generate tasks from chat and documents.")}
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as Section)}
        className="mt-6"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-3 flex items-center gap-3">
        <Progress value={sectionCompletion} className="h-2 flex-1" />
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {sectionCompletion}% complete
        </span>
      </div>

      <div className="mt-4">
        {tasksQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-16 animate-pulse rounded-lg border bg-card opacity-60"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            section={section}
            refining={isBusy}
            onAdd={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
            onRefine={() => refineMut.mutate()}
            onChat={() => navigate({ to: "/chat" })}
            onDocs={() => navigate({ to: "/documents" })}
          />
        ) : section === "past" ? (
          <div className="space-y-2">
            {visible.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                pastMode
                onToggle={() => undefined}
                onEdit={() => undefined}
                onDelete={() => deleteMut.mutate(task.id)}
              />
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visible.map((task) => task.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {visible.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={toggleTask}
                    onEdit={(nextTask) => {
                      setEditing(nextTask);
                      setEditorOpen(true);
                    }}
                    onDelete={(nextTask) => deleteMut.mutate(nextTask.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <TaskEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        initial={editing}
        onSubmit={handleSubmit}
      />
    </main>
  );
}

function SummaryPanel({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof ListTodo;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  section,
  onAdd,
  onRefine,
  refining,
  onChat,
  onDocs,
}: {
  section: Section;
  onAdd: () => void;
  onRefine: () => void;
  refining: boolean;
  onChat: () => void;
  onDocs: () => void;
}) {
  const messages: Record<Section, { title: string; body: string }> = {
    all: {
      title: "No tasks yet",
      body: "Add a task, chat through the plan, or generate tasks from uploaded documents.",
    },
    today: { title: "Nothing due today", body: "Add a task for today or review the full list." },
    week: {
      title: "No tasks this week",
      body: "Plan the week manually or let the assistant refine it.",
    },
    month: { title: "No tasks this month", body: "Add longer-term work when you are ready." },
    past: { title: "No overdue work", body: "You are clear here." },
  };
  const message = messages[section];

  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center sm:p-8">
      <Sparkles className="mx-auto h-6 w-6 text-primary" />
      <h3 className="mt-2 font-medium">{message.title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{message.body}</p>
      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:justify-center">
        <Button onClick={onAdd} size="sm" disabled={refining}>
          <Plus className="mr-1 h-4 w-4" />
          Add task
        </Button>
        <Button onClick={onRefine} size="sm" variant="outline" disabled={refining}>
          {refining ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-4 w-4" />
          )}
          Refine
        </Button>
        <Button onClick={onDocs} size="sm" variant="ghost" disabled={refining}>
          <FileText className="mr-1 h-4 w-4" />
          Docs
        </Button>
        <Button onClick={onChat} size="sm" variant="ghost" disabled={refining}>
          <MessageCircle className="mr-1 h-4 w-4" />
          Chat
        </Button>
      </div>
    </div>
  );
}
