import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { draftPlan, savePlan } from "@/lib/planner.functions";
import { listDocuments, loadSourceBrief } from "@/lib/documents.functions";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "TaskBase | Brief to board" }] }),
  component: PlanningDesk,
});

const sampleBrief = [
  "Send the venue a final headcount by 2026-11-10.",
  "Prepare the volunteer briefing and share the arrival schedule before 2026-11-12.",
  "Design a printed welcome sign if there is time.",
].join("\n\n");

type Draft = Omit<Awaited<ReturnType<typeof draftPlan>>, "budgetBefore"> & {
  budgetBefore: number | null;
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
  const listDocs = useServerFn(listDocuments);
  const openSource = useServerFn(loadSourceBrief);
  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: () => listDocs(),
    enabled: signedIn,
  });
  const readySources = documents.filter((document) => document.status === "ready");
  const [sourceId, setSourceId] = useState("");
  const [loadingSource, setLoadingSource] = useState(false);
  const [brief, setBrief] = useState(sampleBrief);
  const [hours, setHours] = useState(2);
  const [capacityCheck, setCapacityCheck] = useState(false);
  const [researchTopic, setResearchTopic] = useState("");
  const [result, setResult] = useState<Draft | null>(sample);
  const [example, setExample] = useState(true);
  const [availableMinutes, setAvailableMinutes] = useState(120);
  const [selected, setSelected] = useState(new Set(["venue", "volunteers"]));
  const [pending, setPending] = useState<"draft" | "save" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_KEY) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setSignedIn(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  const chosen = result?.tasks.filter((task) => selected.has(task.id)) ?? [];
  const chosenMinutes = chosen.reduce((total, task) => total + task.minutes, 0);

  function resetSample() {
    setBrief(sampleBrief);
    setHours(2);
    setAvailableMinutes(120);
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
      setBrief(source.text);
      setResult(null);
      setSaved(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load that source.");
    } finally {
      setLoadingSource(false);
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !signedIn) return;
    setPending("draft");
    setError("");
    setResult(null);
    setSaved(false);
    try {
      const plan = await draft({ data: { brief, hours, capacityCheck, researchTopic } });
      setResult(plan);
      setAvailableMinutes(hours * 60);
      setExample(false);
      setSelected(new Set(plan.tasks.filter((task) => !task.hold).map((task) => task.id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not draft a plan.");
    } finally {
      setPending(null);
    }
  }

  async function addTasks() {
    if (pending || example || !chosen.length || !signedIn || saved) return;
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
                <Button type="button" variant="outline" size="sm" onClick={resetSample}>
                  Load example
                </Button>
              </div>
              {signedIn && readySources.length > 0 && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-36 flex-1 text-xs">
                    Saved source
                    <select
                      value={sourceId}
                      onChange={(event) => setSourceId(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#cbd6c7] bg-white p-2 text-sm"
                    >
                      <option value="">Choose a document or Google import</option>
                      {readySources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.name}
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
                    {loadingSource ? "Loading…" : "Load into brief"}
                  </Button>
                </div>
              )}
              <div>
                <label htmlFor="brief" className="mb-2 block text-sm font-medium">
                  Handoff notes
                </label>
                <textarea
                  id="brief"
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  minLength={30}
                  maxLength={8000}
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
                  value={Number.isNaN(hours) ? "" : hours}
                  onChange={(event) => setHours(event.target.valueAsNumber)}
                  className="w-24 rounded-lg border border-[#cbd6c7] bg-white px-3 py-2 text-sm"
                />
              </div>
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
              {signedIn ? (
                <Button type="submit" className="w-full bg-[#224938] text-white hover:bg-[#173a2c]">
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
                  {chosenMinutes} / {availableMinutes} min selected
                  {chosenMinutes > availableMinutes ? " · over capacity" : ""}
                </p>
                <ul className="mt-4 space-y-2">
                  {result.tasks.map((task) => (
                    <li key={task.id} className="rounded-xl border border-[#d6ddd0] bg-white p-3.5">
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
                          {task.priority} priority · {task.minutes} min
                          {task.dueDate ? " · Due " + task.dueDate : ""}
                        </p>
                        <p>{task.description}</p>
                        <blockquote className="border-l-2 border-[#b8cda7] pl-2">
                          “{task.evidence}”
                        </blockquote>
                        {task.hold && <p className="text-[#815121]">Review note · {task.hold}</p>}
                      </div>
                    </li>
                  ))}
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
                      disabled={!!pending || saved || chosen.length === 0 || !signedIn}
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
