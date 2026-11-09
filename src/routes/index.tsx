import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Braces,
  Check,
  ClipboardList,
  FileText,
  Layers,
  Radio,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CalendarSourceLink } from "@/components/calendar-source-link";
import { hasBrowserSupabaseConfig, supabase } from "@/integrations/supabase/client";
import { draftPlan, getPlanningOptions, savePlan } from "@/lib/planner.functions";
import { listDocuments, loadSourceBrief, searchKnowledge } from "@/lib/documents.functions";
import { sourceHeading, sourceLabel } from "@/lib/document-text";
import { checkCalendarCapacity } from "@/lib/google.functions";
import { useGoogleOAuth } from "@/hooks/use-google-oauth";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "TaskBase | Brief to board" }] }),
  component: PlanningDesk,
});

const sampleBrief = [
  "Send the venue a final headcount by 2026-11-10.",
  "Prepare the volunteer briefing and share the arrival schedule before 2026-11-12.",
  "Design a printed welcome sign if there is time.",
].join("\n\n");
const BRIEF_LIMIT = 8000;
const MIN_ESTIMATE = 5;
const MAX_ESTIMATE = 2400;

function validEstimate(minutes: number) {
  return Number.isInteger(minutes) && minutes >= MIN_ESTIMATE && minutes <= MAX_ESTIMATE;
}

type Draft = Omit<Awaited<ReturnType<typeof draftPlan>>, "budgetBefore" | "conversationId"> & {
  budgetBefore: number | null;
  conversationId?: string;
};
const sample: Draft = {
  tasks: [
    {
      id: "venue",
      title: "Confirm the venue headcount",
      description: "Send the final number to the venue contact.",
      priority: "high",
      dueDate: "2026-11-10",
      minutes: 30,
      evidence: "Send the venue a final headcount by 2026-11-10.",
      hold: null,
    },
    {
      id: "volunteers",
      title: "Brief the volunteers",
      description: "Write the briefing and send the arrival schedule.",
      priority: "medium",
      dueDate: "2026-11-12",
      minutes: 90,
      evidence: "Prepare the volunteer briefing and share the arrival schedule before 2026-11-12.",
      hold: null,
    },
    {
      id: "sign",
      title: "Design a printed welcome sign",
      description: "Prepare a simple sign for the event entrance.",
      priority: "low",
      dueDate: null,
      minutes: 60,
      evidence: "Design a printed welcome sign if there is time.",
      hold: "The source marks this as optional. The first two tasks fill the two-hour budget.",
    },
  ],
  summary:
    "Confirm the venue first, then brief volunteers. Hold the welcome sign until more time opens up.",
  research: "",
  capacityNotes: "",
  budgetBefore: null,
  traces: [],
};

function PlanningDesk() {
  const draft = useServerFn(draftPlan);
  const save = useServerFn(savePlan);
  const queryClient = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);
  const loadPlanningOptions = useServerFn(getPlanningOptions);
  const { data: planningOptions } = useQuery({
    queryKey: ["planning-options"],
    queryFn: () => loadPlanningOptions(),
    enabled: signedIn,
  });
  const optionalToolsAvailable = planningOptions?.freeDemo === false;
  const listDocs = useServerFn(listDocuments);
  const openSource = useServerFn(loadSourceBrief);
  const searchSources = useServerFn(searchKnowledge);
  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: () => listDocs(),
    enabled: signedIn,
  });
  const readySources = documents.filter((document) => document.status === "ready");
  const [sourceId, setSourceId] = useState("");
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");
  const passages = useMutation({
    mutationFn: () =>
      searchSources({ data: { query: sourceQuery, sourceId: sourceId || undefined } }),
  });
  const [brief, setBrief] = useState(sampleBrief);
  const [hours, setHours] = useState(2);
  const { googleAvailable } = useGoogleOAuth();
  const checkCalendar = useServerFn(checkCalendarCapacity);
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [calendarResult, setCalendarResult] = useState<Awaited<
    ReturnType<typeof checkCalendarCapacity>
  > | null>(null);
  const [useCalendar, setUseCalendar] = useState(false);
  const [checkingCalendar, setCheckingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [capacityCheck, setCapacityCheck] = useState(false);
  const [researchTopic, setResearchTopic] = useState("");
  const [result, setResult] = useState<Draft | null>(sample);
  const [example, setExample] = useState(true);
  const [availableMinutes, setAvailableMinutes] = useState(120);
  const [longestBlock, setLongestBlock] = useState<number | null>(null);
  const [estimates, setEstimates] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState(new Set(["venue", "volunteers"]));
  const [pending, setPending] = useState<"draft" | "save" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!hasBrowserSupabaseConfig) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setSignedIn(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  const chosen =
    result?.tasks
      .filter((task) => selected.has(task.id))
      .map((task) => ({ ...task, minutes: estimates[task.id] ?? task.minutes })) ?? [];
  const hasInvalidEstimate = chosen.some((task) => !validEstimate(task.minutes));
  const chosenMinutes = chosen.reduce(
    (total, task) => total + (validEstimate(task.minutes) ? task.minutes : 0),
    0,
  );
  const hasAdjustedEstimate = result?.tasks.some(
    (task) => estimates[task.id] !== undefined && estimates[task.id] !== task.minutes,
  );

  function resetSample() {
    setBrief(sampleBrief);
    setHours(2);
    setUseCalendar(false);
    setAvailableMinutes(120);
    setLongestBlock(null);
    setEstimates({});
    setResearchTopic("");
    setCapacityCheck(false);
    setExample(true);
    setResult(sample);
    setSelected(new Set(["venue", "volunteers"]));
    setSaved(false);
    setError("");
  }

  async function openSelectedSource() {
    setLoadingSource(true);
    setError("");
    try {
      const source = await openSource({ data: { id: sourceId } });
      replaceBrief(source.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load that source.");
    } finally {
      setLoadingSource(false);
    }
  }

  function replaceBrief(text: string) {
    setBrief(text);
    setResult(null);
    setEstimates({});
    setSaved(false);
    setError("");
  }

  function addPassage(source: NonNullable<typeof passages.data>[number], replace: boolean) {
    const passage = `Source · ${sourceHeading(source)}\n${source.excerpt}`;
    const existing = replace ? "" : brief.trimEnd();
    const next = existing ? existing + "\n\n" + passage : passage;
    if (!replace && existing.includes(source.excerpt)) {
      setError("That passage is already in the brief.");
      return;
    }
    if (next.length > BRIEF_LIMIT) {
      setError("This passage would exceed the brief limit. Shorten the brief before adding it.");
      return;
    }
    replaceBrief(next);
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || checkingCalendar || !signedIn) return;
    const calendarCapacity =
      useCalendar && calendarResult
        ? {
            availableMinutes: calendarResult.availableMinutes,
            longestBlockMinutes: calendarResult.longestBlockMinutes,
          }
        : undefined;
    setPending("draft");
    setError("");
    setResult(null);
    setEstimates({});
    setSaved(false);
    try {
      const plan = await draft({
        data: {
          brief,
          ...(calendarCapacity ? { calendarCapacity } : { hours }),
          capacityCheck: optionalToolsAvailable && capacityCheck,
          researchTopic: optionalToolsAvailable ? researchTopic : "",
        },
      });
      setResult(plan);
      setAvailableMinutes(calendarCapacity?.availableMinutes ?? hours * 60);
      setLongestBlock(calendarCapacity?.longestBlockMinutes ?? null);
      setExample(false);
      setSelected(new Set(plan.tasks.filter((task) => !task.hold).map((task) => task.id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not draft a plan.");
    } finally {
      setPending(null);
    }
  }

  function clearCalendarResult() {
    setCalendarResult(null);
    setUseCalendar(false);
    setCalendarError("");
  }

  async function loadCalendarCapacity() {
    clearCalendarResult();
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end.getTime() - start.getTime() < 60_000 ||
      end.getTime() - start.getTime() > 80 * 3_600_000
    ) {
      setCalendarError("Choose a start and end from 1 minute to 80 hours apart.");
      return;
    }
    setCheckingCalendar(true);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.provider_token;
      if (!accessToken) throw new Error("Allow Calendar availability in Integrations first.");
      setCalendarResult(
        await checkCalendar({
          data: { accessToken, start: start.toISOString(), end: end.toISOString() },
        }),
      );
    } catch (cause) {
      setCalendarError(
        cause instanceof Error ? cause.message : "Could not check Calendar availability.",
      );
    } finally {
      setCheckingCalendar(false);
    }
  }

  async function addTasks() {
    if (pending || example || !chosen.length || hasInvalidEstimate || !signedIn || saved) return;
    setPending("save");
    setError("");
    try {
      await save({ data: chosen });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the plan.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f4ed] text-[#1e3027]">
      <header className="border-b border-[#d6ddd0]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 font-semibold">
            <span className="rounded-lg bg-[#224938] p-2 text-white">
              <Layers size={17} />
            </span>
            TaskBase
          </Link>
          <Button asChild variant="outline" className="border-[#d1dacb] bg-white/60 text-[#224938]">
            <Link to={signedIn ? "/home" : "/auth"}>
              {signedIn ? "My board" : "Sign in"}
              <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="mb-8 overflow-hidden rounded-3xl bg-[#173a2c] px-7 py-9 text-[#f3f4ed] sm:px-10">
          <div className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-[.18em] uppercase text-[#c4dda5]">
            <Radio size={14} /> TaskBase Planning Desk
          </div>
          <h1 className="max-w-2xl text-5xl leading-[1.02] sm:text-6xl">
            From messy brief
            <br />
            to a plan you can trust.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-[#dae6d7] sm:text-base">
            Turn handoff notes into tasks with evidence you can check. A second model reviews the
            draft before you decide what goes on your board.
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <form
            onSubmit={generate}
            className="rounded-2xl border border-[#d6ddd0] bg-[#fcfcf7] p-5 sm:p-6"
          >
            <fieldset disabled={!!pending || loadingSource} className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-2xl">
                  <FileText size={19} /> 01 / Brief
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={resetSample}>
                    Load example
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!brief}
                    onClick={() => replaceBrief("")}
                  >
                    Clear brief
                  </Button>
                </div>
              </div>
              {signedIn && readySources.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-36 flex-1 text-xs">
                      Saved source
                      <select
                        value={sourceId}
                        onChange={(event) => {
                          setSourceId(event.target.value);
                          passages.reset();
                        }}
                        disabled={passages.isPending}
                        className="mt-1 w-full rounded-lg border border-[#cbd6c7] bg-white p-2 text-sm"
                      >
                        <option value="">All saved sources</option>
                        {readySources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {sourceLabel(source.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!sourceId}
                      onClick={openSelectedSource}
                    >
                      {loadingSource ? "Loading…" : "Load source"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-36 flex-1 text-xs">
                      Find a passage
                      <input
                        value={sourceQuery}
                        onChange={(event) => setSourceQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                          event.preventDefault();
                          if (sourceQuery.trim().length >= 2 && !passages.isPending)
                            passages.mutate();
                        }}
                        maxLength={300}
                        placeholder="Try a deadline or project name"
                        className="mt-1 w-full rounded-lg border border-[#cbd6c7] bg-white p-2 text-sm"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={sourceQuery.trim().length < 2 || passages.isPending}
                      onClick={() => passages.mutate()}
                    >
                      {passages.isPending ? "Searching…" : "Search sources"}
                    </Button>
                  </div>
                  {passages.error && (
                    <p role="alert" className="text-sm text-destructive">
                      {passages.error.message}
                    </p>
                  )}
                  {passages.data && (
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      <p role="status" className="text-xs">
                        {passages.data.length
                          ? `${passages.data.length} matching passage${passages.data.length === 1 ? "" : "s"}`
                          : "No matching passages."}
                      </p>
                      {passages.data.map((source) => (
                        <details
                          key={source.id + ":" + source.section}
                          className="rounded-lg border p-2 text-sm"
                        >
                          <summary className="cursor-pointer">{sourceHeading(source)}</summary>
                          <p className="my-2 whitespace-pre-wrap">{source.excerpt}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <CalendarSourceLink url={source.url} />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addPassage(source, true)}
                            >
                              Replace brief with passage
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={brief === sampleBrief}
                              onClick={() => addPassage(source, false)}
                            >
                              Add passage to brief
                            </Button>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                  {passages.data?.length && brief === sampleBrief ? (
                    <p className="text-xs text-[#4f6357]">
                      Replace or clear the example brief before adding passages.
                    </p>
                  ) : null}
                </div>
              )}
              <div>
                <label htmlFor="brief" className="mb-2 block text-sm font-medium">
                  Handoff notes
                </label>
                <textarea
                  id="brief"
                  value={brief}
                  onChange={(event) => replaceBrief(event.target.value)}
                  minLength={30}
                  maxLength={BRIEF_LIMIT}
                  required
                  rows={7}
                  className="w-full rounded-xl border border-[#cbd6c7] bg-white p-3 text-sm leading-relaxed"
                />
                <p className="text-right text-xs text-[#4f6357]">{brief.length} / 8,000</p>
              </div>
              <div>
                <label htmlFor="hours" className="mb-2 block text-sm font-medium">
                  Hours available
                </label>
                <input
                  id="hours"
                  type="number"
                  min={1}
                  max={80}
                  required
                  disabled={useCalendar}
                  value={Number.isNaN(hours) ? "" : hours}
                  onChange={(event) => setHours(event.target.valueAsNumber)}
                  className="w-24 rounded-lg border border-[#cbd6c7] bg-white px-3 py-2 text-sm"
                />
              </div>
              {signedIn && (
                <details className="rounded-xl border border-[#d6ddd0] p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Use Calendar availability
                  </summary>
                  <p className="mt-2 text-xs text-[#4f6357]">
                    Choose a work window in your local time. Otari receives the available minutes
                    and longest free block.
                  </p>
                  {googleAvailable ? (
                    <>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label>
                          Window starts
                          <input
                            type="datetime-local"
                            value={windowStart}
                            disabled={checkingCalendar}
                            onInput={(event) => {
                              setWindowStart(event.currentTarget.value);
                              clearCalendarResult();
                            }}
                            className="block w-full rounded-lg border border-[#cbd6c7] bg-white p-2"
                          />
                        </label>
                        <label>
                          Window ends
                          <input
                            type="datetime-local"
                            value={windowEnd}
                            disabled={checkingCalendar}
                            onInput={(event) => {
                              setWindowEnd(event.currentTarget.value);
                              clearCalendarResult();
                            }}
                            className="block w-full rounded-lg border border-[#cbd6c7] bg-white p-2"
                          />
                        </label>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        disabled={checkingCalendar || !windowStart || !windowEnd}
                        onClick={loadCalendarCapacity}
                      >
                        {checkingCalendar ? "Checking…" : "Check primary Calendar"}
                      </Button>
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-[#4f6357]">
                      Google OAuth is unavailable in this workspace.
                    </p>
                  )}
                  <p className="mt-2 text-xs">
                    <Link to="/permissions" className="underline">
                      Manage Calendar permissions
                    </Link>
                  </p>
                  {calendarError && (
                    <p role="alert" className="mt-2 text-sm text-red-800">
                      {calendarError}
                    </p>
                  )}
                  {calendarResult && (
                    <div className="mt-3 rounded-lg bg-white/70 p-2">
                      <p role="status">
                        {calendarResult.availableMinutes} min free across{" "}
                        {calendarResult.freeBlocks} blocks. Longest block:{" "}
                        {calendarResult.longestBlockMinutes} min.
                      </p>
                      {calendarResult.availableMinutes > 0 && (
                        <label className="mt-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={useCalendar}
                            onChange={(event) => setUseCalendar(event.target.checked)}
                          />
                          Use this capacity for the draft
                        </label>
                      )}
                    </div>
                  )}
                </details>
              )}
              {planningOptions?.freeDemo && (
                <p className="rounded-xl border border-[#d6ddd0] p-3 text-sm">
                  Free model mode is active. Planning and review use the configured free routes.
                  Optional web research and code execution are off.
                </p>
              )}
              {optionalToolsAvailable && (
                <details className="rounded-xl border border-[#d6ddd0] p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Optional Otari tools</summary>
                  <label className="mt-3 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={capacityCheck}
                      onChange={(event) => setCapacityCheck(event.target.checked)}
                    />
                    Check the estimates with code execution
                  </label>
                  <label htmlFor="topic" className="mt-3 block">
                    Public web research topic
                  </label>
                  <input
                    id="topic"
                    value={researchTopic}
                    onChange={(event) => setResearchTopic(event.target.value)}
                    maxLength={160}
                    placeholder="e.g. accessible event signage"
                    className="mt-1 w-full rounded-lg border border-[#cbd6c7] bg-white px-3 py-2"
                  />
                  <p className="mt-2 text-xs text-[#4f6357]">
                    The search step receives only this topic. Enter public information here.
                  </p>
                </details>
              )}
              {signedIn ? (
                <Button
                  type="submit"
                  disabled={checkingCalendar}
                  className="w-full bg-[#224938] text-white hover:bg-[#173a2c]"
                >
                  <Sparkles size={16} />{" "}
                  {pending === "draft" ? "Drafting and reviewing…" : "Draft with Otari"}
                </Button>
              ) : (
                <Button asChild className="w-full bg-[#224938] text-white hover:bg-[#173a2c]">
                  <Link to="/auth">
                    Sign in to draft with Otari
                    <ArrowRight size={15} />
                  </Link>
                </Button>
              )}
              <p className="text-xs text-[#4f6357]">
                Live drafts send your brief to Otari for processing. You choose which tasks to save.
              </p>
            </fieldset>
          </form>

          <section
            aria-labelledby="review"
            className="rounded-2xl border border-[#d6ddd0] bg-[#fcfcf7] p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="review" className="flex items-center gap-2 text-2xl">
                <ClipboardList size={19} /> 02 / Review
              </h2>
              {result && (
                <span className="rounded-full bg-[#e2ebd8] px-3 py-1 text-xs font-semibold text-[#224938]">
                  {example ? "Example · no API call" : "Live Otari draft"}
                </span>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            )}
            {!result ? (
              <p role="status" className="mt-5 text-sm text-[#4f6357]">
                {pending === "draft"
                  ? "Checking source excerpts and reviewing the workload."
                  : "A draft will appear here when it is ready."}
              </p>
            ) : (
              <>
                <p className="mt-4 text-sm leading-relaxed text-[#4f6357]">{result.summary}</p>
                <p role="status" className="mt-3 text-sm font-semibold">
                  {hasInvalidEstimate
                    ? "Enter a valid estimate for every selected task."
                    : `${chosenMinutes} / ${availableMinutes} min selected${chosenMinutes > availableMinutes ? " · over capacity" : ""}`}
                </p>
                {hasAdjustedEstimate && (
                  <p className="mt-1 text-xs text-[#4f6357]">
                    Totals use your edits. Reviewer notes and any Otari capacity check reflect the
                    original estimates.
                  </p>
                )}
                <ul className="mt-4 space-y-2">
                  {result.tasks.map((task) => {
                    const estimate = estimates[task.id] ?? task.minutes;
                    return (
                      <li
                        key={task.id}
                        className="rounded-xl border border-[#d6ddd0] bg-white p-3.5"
                      >
                        <label className="flex items-start gap-3 text-sm font-semibold">
                          <input
                            className="mt-1 accent-[#224938]"
                            type="checkbox"
                            checked={selected.has(task.id)}
                            disabled={!!pending || saved}
                            onChange={(event) => {
                              const next = new Set(selected);
                              if (event.target.checked) next.add(task.id);
                              else next.delete(task.id);
                              setSelected(next);
                            }}
                          />
                          {task.title}
                        </label>
                        <div className="ml-6 mt-1 space-y-1.5 text-xs leading-relaxed text-[#4f6357]">
                          <p className="font-semibold capitalize">
                            {task.priority} priority
                            {task.dueDate ? " · Due " + task.dueDate : ""}
                          </p>
                          <label className="flex flex-wrap items-center gap-2">
                            <span>Estimated minutes</span>
                            <input
                              aria-label={`Estimated minutes for ${task.title}`}
                              aria-invalid={!validEstimate(estimate)}
                              type="number"
                              min={MIN_ESTIMATE}
                              max={MAX_ESTIMATE}
                              step={1}
                              value={Number.isNaN(estimate) ? "" : estimate}
                              disabled={!!pending || saved}
                              onChange={(event) => {
                                const minutes = event.target.valueAsNumber;
                                setEstimates((current) => ({ ...current, [task.id]: minutes }));
                              }}
                              className="w-20 rounded border border-[#cbd6c7] px-2 py-1"
                            />
                            {estimate !== task.minutes && (
                              <span>Originally {task.minutes} min</span>
                            )}
                          </label>
                          {!validEstimate(estimate) && (
                            <p className="text-red-800">Enter 5 to 2,400 whole minutes.</p>
                          )}
                          {validEstimate(estimate) &&
                            longestBlock != null &&
                            estimate > longestBlock && (
                              <p className="text-[#815121]">
                                This estimate exceeds the {longestBlock}-minute Calendar opening.
                              </p>
                            )}
                          <p>{task.description}</p>
                          <blockquote className="border-l-2 border-[#b8cda7] pl-2">
                            “{task.evidence}”
                          </blockquote>
                          {task.hold && <p className="text-[#815121]">Review note · {task.hold}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {result.research && (
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm">
                    <strong>Public research</strong>
                    <br />
                    {result.research}
                  </p>
                )}
                {result.capacityNotes && (
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm">
                    <strong>Capacity check</strong>
                    <br />
                    {result.capacityNotes}
                  </p>
                )}
                {result.traces.length > 0 && (
                  <details className="mt-4 rounded-xl bg-[#e9efe4] p-3 text-xs">
                    <summary className="cursor-pointer font-semibold">
                      <Braces className="mr-1 inline" size={14} /> Otari run details
                    </summary>
                    {result.conversationId && (
                      <p className="mt-2 break-all">
                        Otari session <code>{result.conversationId}</code>
                      </p>
                    )}
                    {result.budgetBefore != null && (
                      <p className="mt-2">
                        Budget remaining before draft · ${result.budgetBefore.toFixed(4)}
                      </p>
                    )}
                    {result.traces.map((trace, index) => (
                      <div
                        key={index}
                        className="mt-3 break-words border-t border-[#cbd6c7] pt-2 leading-relaxed"
                      >
                        <strong className="capitalize">{trace.role}</strong> ·{" "}
                        {trace.model ?? trace.route}
                        <br />
                        Route {trace.route}
                        {trace.provider ? " · " + trace.provider : ""}
                        {trace.attempts && <> · {trace.attempts} attempt(s)</>}
                        {trace.fallback && <> · Fallback {trace.fallback}</>}
                        {trace.requestId && (
                          <>
                            <br />
                            Request <code>{trace.requestId}</code>
                          </>
                        )}
                        {trace.tokens != null && <> · {trace.tokens} tokens</>}
                        {trace.cost != null && <> · ${trace.cost}</>}
                        {trace.toolsRequested.length > 0 && (
                          <>
                            <br />
                            Tool requested {trace.toolsRequested.join(", ")}
                          </>
                        )}
                      </div>
                    ))}
                  </details>
                )}
                {!example && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      onClick={addTasks}
                      disabled={
                        !!pending || saved || chosen.length === 0 || hasInvalidEstimate || !signedIn
                      }
                      className="bg-[#224938] text-white hover:bg-[#173a2c]"
                    >
                      <Check size={15} />{" "}
                      {saved
                        ? "Added to board"
                        : pending === "save"
                          ? "Saving…"
                          : `Add ${chosen.length} to board`}
                    </Button>
                    {saved && (
                      <Link to="/home" className="text-sm underline">
                        Open board
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
