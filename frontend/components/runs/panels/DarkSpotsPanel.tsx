"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  DarkSpotReport,
  EpistemicClaim,
  InformationGap,
  OutdatedWarning,
  RunEvidence,
  RunGraph,
  RunSource,
  UnansweredQuestion,
  VerificationItem,
} from "@/lib/types";

function getPriorityGroup(item: VerificationItem): "HIGH" | "MEDIUM" | "LOW" {
  if (typeof item.priority === "string") {
    const up = item.priority.toUpperCase().trim();
    if (up === "HIGH") return "HIGH";
    if (up === "MEDIUM") return "MEDIUM";
    if (up === "LOW") return "LOW";
  }
  if (typeof item.priority === "number" || item.priority_rank) {
    const rank = item.priority_rank ?? (typeof item.priority === "number" ? item.priority : 1);
    if (rank === 1) return "HIGH";
    if (rank === 2) return "MEDIUM";
    return "LOW";
  }
  return "HIGH";
}

function getEpistemicType(cl: EpistemicClaim): "SOURCED_FACT" | "AI_INFERENCE" | "GAP_UNCERTAINTY" {
  const c = String(cl.classification || "").toUpperCase().trim();
  if (c.includes("FACT")) return "SOURCED_FACT";
  if (c.includes("INFER") || c.includes("SYNTHESIS")) return "AI_INFERENCE";
  return "GAP_UNCERTAINTY";
}

export function DarkSpotsPanel({ graph }: { graph: RunGraph }) {
  const darkspots: DarkSpotReport | null = graph.run.darkspot_report ?? null;

  const gaps: InformationGap[] = darkspots?.gaps ?? [];
  const unanswered: UnansweredQuestion[] = darkspots?.unanswered_questions ?? [];
  const outdated: OutdatedWarning[] = darkspots?.outdated_warnings ?? [];
  const checklist: VerificationItem[] = darkspots?.verification_checklist ?? [];
  const claims: EpistemicClaim[] = darkspots?.epistemic_claims ?? [];

  const [activeSection, setActiveSection] = useState<
    "all" | "checklist" | "epistemic" | "gaps" | "unanswered" | "outdated"
  >("all");

  const [epistemicFilter, setEpistemicFilter] = useState<
    "all" | "SOURCED_FACT" | "AI_INFERENCE" | "GAP_UNCERTAINTY"
  >("all");

  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const toggleCheck = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const totalFindings = gaps.length + unanswered.length + outdated.length;

  // Group checklist items deterministically
  const groupedChecklist = useMemo(() => {
    const high: VerificationItem[] = [];
    const medium: VerificationItem[] = [];
    const low: VerificationItem[] = [];

    for (const item of checklist) {
      const g = getPriorityGroup(item);
      if (g === "HIGH") high.push(item);
      else if (g === "MEDIUM") medium.push(item);
      else low.push(item);
    }

    return { high, medium, low };
  }, [checklist]);

  // Group epistemic claims
  const filteredClaims = useMemo(() => {
    if (epistemicFilter === "all") return claims;
    return claims.filter((c) => getEpistemicType(c) === epistemicFilter);
  }, [claims, epistemicFilter]);

  const epistemicCounts = useMemo(() => {
    let facts = 0;
    let inferences = 0;
    let uncertainties = 0;
    for (const c of claims) {
      const t = getEpistemicType(c);
      if (t === "SOURCED_FACT") facts++;
      else if (t === "AI_INFERENCE") inferences++;
      else uncertainties++;
    }
    return { facts, inferences, uncertainties };
  }, [claims]);

  if (!darkspots || (totalFindings === 0 && checklist.length === 0 && claims.length === 0)) {
    const isRunning = graph.run.status === "RUNNING";
    return (
      <EmptyState
        title={isRunning ? "Analyzing information gaps..." : "No dark spots detected"}
        description={
          isRunning
            ? "The Digital Dark Spot engine analyzes missing requirements, outdated signals, and unanswered questions after evidence gathering."
            : "No material information gaps, outdated source warnings, or critical uncertainties were identified for this research run."
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card border-l-4 border-l-accent p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                Digital Dark Spot
              </span>
              <span className="rounded bg-bg-surface px-2 py-0.5 font-mono text-[length:var(--text-micro)] text-text-muted">
                {darkspots.detector_status === "complete"
                  ? "Deterministic & Grounded Priority Engine"
                  : "Deterministic Fallback"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              AI-assisted identification of missing requirements, potentially outdated data,
              unanswered questions, and three-way epistemic boundaries. Every finding is traceable to its evidence.
            </p>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs text-text-muted">
            <span>
              <strong className="text-text-primary">{gaps.length}</strong> Gaps
            </span>
            <span>•</span>
            <span>
              <strong className="text-text-primary">{unanswered.length}</strong> Questions
            </span>
            <span>•</span>
            <span>
              <strong className="text-text-primary">{outdated.length}</strong> Outdated
            </span>
            <span>•</span>
            <span>
              <strong className="text-rose-400">{groupedChecklist.high.length}</strong> High Priority
            </span>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {(
            [
              { id: "all", label: "All Findings", count: totalFindings },
              { id: "checklist", label: "What to Verify Next", count: checklist.length },
              { id: "epistemic", label: "Epistemic Classification", count: claims.length },
              { id: "gaps", label: "Information Gaps", count: gaps.length },
              { id: "unanswered", label: "Unanswered Questions", count: unanswered.length },
              { id: "outdated", label: "Outdated Signals", count: outdated.length },
            ] as const
          ).map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSection(sec.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                activeSection === sec.id
                  ? "bg-accent text-accent-contrast"
                  : "bg-bg-surface text-text-secondary hover:text-text-primary"
              }`}
            >
              {sec.label}
              {sec.count !== undefined && (
                <span className="ml-1.5 opacity-70 tabular-nums">({sec.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* PHASE 8 & 11: DETERMINISTIC PRIORITIZED VERIFICATION CHECKLIST */}
      {(activeSection === "all" || activeSection === "checklist") && checklist.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                What to Verify Next (Deterministic Priority Engine)
              </h3>
              <p className="text-[length:var(--text-micro)] text-text-secondary">
                Actions ranked by deterministic criteria: decision contradictions, missing mandatory requirements, and deadline uncertainty.
              </p>
            </div>
            <span className="font-mono text-[length:var(--text-micro)] text-text-muted">
              {Object.values(checkedItems).filter(Boolean).length}/{checklist.length} verified
            </span>
          </div>

          {/* HIGH PRIORITY */}
          {groupedChecklist.high.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 border-b border-rose-500/20 pb-1">
                <span className="rounded bg-rose-500/10 px-2 py-0.5 font-mono text-xs font-bold uppercase text-rose-400 border border-rose-500/30">
                  HIGH PRIORITY ({groupedChecklist.high.length})
                </span>
                <span className="text-[length:var(--text-micro)] text-text-muted">
                  Contradictions affecting decisions, missing mandatory requirements, deadline uncertainty, official-source conflicts
                </span>
              </div>
              <div className="space-y-2">
                {groupedChecklist.high.map((item) => (
                  <VerificationCard
                    key={item.id}
                    item={item}
                    graph={graph}
                    checked={Boolean(checkedItems[item.id])}
                    onToggle={() => toggleCheck(item.id)}
                    priorityColor="rose"
                  />
                ))}
              </div>
            </div>
          )}

          {/* MEDIUM PRIORITY */}
          {groupedChecklist.medium.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2 border-b border-amber-500/20 pb-1">
                <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-bold uppercase text-amber-400 border border-amber-500/30">
                  MEDIUM PRIORITY ({groupedChecklist.medium.length})
                </span>
                <span className="text-[length:var(--text-micro)] text-text-muted">
                  Incomplete supporting information, secondary-source conflicts, moderate uncertainty
                </span>
              </div>
              <div className="space-y-2">
                {groupedChecklist.medium.map((item) => (
                  <VerificationCard
                    key={item.id}
                    item={item}
                    graph={graph}
                    checked={Boolean(checkedItems[item.id])}
                    onToggle={() => toggleCheck(item.id)}
                    priorityColor="amber"
                  />
                ))}
              </div>
            </div>
          )}

          {/* LOW PRIORITY */}
          {groupedChecklist.low.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2 border-b border-blue-500/20 pb-1">
                <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-xs font-bold uppercase text-blue-400 border border-blue-500/30">
                  LOW PRIORITY ({groupedChecklist.low.length})
                </span>
                <span className="text-[length:var(--text-micro)] text-text-muted">
                  Useful but non-critical missing context and supplemental guidelines
                </span>
              </div>
              <div className="space-y-2">
                {groupedChecklist.low.map((item) => (
                  <VerificationCard
                    key={item.id}
                    item={item}
                    graph={graph}
                    checked={Boolean(checkedItems[item.id])}
                    onToggle={() => toggleCheck(item.id)}
                    priorityColor="blue"
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* PHASE 9: THREE-WAY INFORMATION CLASSIFICATION */}
      {(activeSection === "all" || activeSection === "epistemic") && claims.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Three-Way Information Classification
              </h3>
              <p className="text-[length:var(--text-micro)] text-text-secondary">
                Never represent an AI inference as a sourced fact.
              </p>
            </div>
            {/* Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[length:var(--text-micro)]">
              <button
                type="button"
                onClick={() => setEpistemicFilter("all")}
                className={`rounded px-2 py-0.5 transition-colors ${
                  epistemicFilter === "all"
                    ? "bg-text-primary text-bg-surface font-bold"
                    : "bg-bg-surface text-text-muted hover:text-text-primary"
                }`}
              >
                All ({claims.length})
              </button>
              <button
                type="button"
                onClick={() => setEpistemicFilter("SOURCED_FACT")}
                className={`rounded px-2 py-0.5 transition-colors border ${
                  epistemicFilter === "SOURCED_FACT"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500 font-bold"
                    : "bg-emerald-500/5 text-emerald-400/80 border-emerald-500/20 hover:bg-emerald-500/10"
                }`}
              >
                🟢 SOURCED FACT ({epistemicCounts.facts})
              </button>
              <button
                type="button"
                onClick={() => setEpistemicFilter("AI_INFERENCE")}
                className={`rounded px-2 py-0.5 transition-colors border ${
                  epistemicFilter === "AI_INFERENCE"
                    ? "bg-blue-500/20 text-blue-400 border-blue-500 font-bold"
                    : "bg-blue-500/5 text-blue-400/80 border-blue-500/20 hover:bg-blue-500/10"
                }`}
              >
                🔵 AI INFERENCE ({epistemicCounts.inferences})
              </button>
              <button
                type="button"
                onClick={() => setEpistemicFilter("GAP_UNCERTAINTY")}
                className={`rounded px-2 py-0.5 transition-colors border ${
                  epistemicFilter === "GAP_UNCERTAINTY"
                    ? "bg-amber-500/20 text-amber-400 border-amber-500 font-bold"
                    : "bg-amber-500/5 text-amber-400/80 border-amber-500/20 hover:bg-amber-500/10"
                }`}
              >
                🟡 GAP / UNCERTAINTY ({epistemicCounts.uncertainties})
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {filteredClaims.map((cl, idx) => {
              const type = getEpistemicType(cl);
              const text = cl.statement || cl.claim || "";
              const rationale = cl.rationale || cl.risk_rationale || "";

              if (type === "SOURCED_FACT") {
                return (
                  <div
                    key={idx}
                    className="card space-y-2 p-3.5 border-l-4 border-l-emerald-500 bg-emerald-500/[0.02]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[length:var(--text-micro)] font-bold text-emerald-400 border border-emerald-500/30">
                        <span>🟢</span> SOURCED FACT
                      </span>
                      <span className="font-mono text-[length:var(--text-micro)] text-emerald-400/80">
                        Direct Evidence
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-text-primary leading-relaxed">
                      {text}
                    </p>
                    {cl.source_title && (
                      <div className="text-xs text-text-secondary">
                        <strong className="text-text-muted">Source:</strong>{" "}
                        {cl.source_url ? (
                          <a
                            href={cl.source_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-accent hover:underline"
                          >
                            {cl.source_title}
                          </a>
                        ) : (
                          <span>{cl.source_title}</span>
                        )}
                      </div>
                    )}
                    {cl.supporting_snippets && cl.supporting_snippets.length > 0 && (
                      <blockquote className="rounded bg-bg-surface p-2 text-xs text-text-secondary italic border-l-2 border-emerald-500/40">
                        &ldquo;{cl.supporting_snippets[0]}&rdquo;
                      </blockquote>
                    )}
                  </div>
                );
              }

              if (type === "AI_INFERENCE") {
                return (
                  <div
                    key={idx}
                    className="card space-y-2 p-3.5 border-l-4 border-l-blue-500 bg-blue-500/[0.02]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[length:var(--text-micro)] font-bold text-blue-400 border border-blue-500/30">
                        <span>🔵</span> AI SYNTHESIS / INFERENCE
                      </span>
                      <span className="font-mono text-[length:var(--text-micro)] text-blue-400/80">
                        Synthesized Deduction
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-text-primary leading-relaxed">
                      {text}
                    </p>
                    {rationale && (
                      <div className="rounded bg-bg-surface p-2 text-xs text-text-secondary border-l-2 border-blue-500/40">
                        <span className="font-semibold text-blue-400">Synthesis Rationale:</span>{" "}
                        {rationale}
                      </div>
                    )}
                    <div className="text-[length:var(--text-micro)] text-text-muted italic">
                      Inference generated by reasoning across evidence; not an explicit single-source statement.
                    </div>
                  </div>
                );
              }

              // GAP_UNCERTAINTY
              return (
                <div
                  key={idx}
                  className="card space-y-2 p-3.5 border-l-4 border-l-amber-500 bg-amber-500/[0.02]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[length:var(--text-micro)] font-bold text-amber-400 border border-amber-500/30">
                      <span>🟡</span> GAP / UNCERTAINTY
                    </span>
                    <span className="font-mono text-[length:var(--text-micro)] text-amber-400/80">
                      Unestablished
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-text-primary leading-relaxed">
                    {text}
                  </p>
                  {rationale && (
                    <div className="rounded bg-bg-surface p-2 text-xs text-text-secondary border-l-2 border-amber-500/40">
                      <span className="font-semibold text-amber-400">Unestablished Criteria:</span>{" "}
                      {rationale}
                    </div>
                  )}
                  <div className="text-[length:var(--text-micro)] text-text-muted italic">
                    Not established sufficiently by reviewed sources. Requires primary authority verification.
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Information Gaps (Missing Requirements) */}
      {(activeSection === "all" || activeSection === "gaps") && gaps.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Information Gaps (Missing Requirements)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {gaps.map((gap) => (
              <InformationGapCard key={gap.id} gap={gap} graph={graph} />
            ))}
          </div>
        </section>
      )}

      {/* Unanswered Questions */}
      {(activeSection === "all" || activeSection === "unanswered") && unanswered.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Materially Relevant Unanswered Questions
          </h3>
          <div className="space-y-2">
            {unanswered.map((uq, idx) => (
              <UnansweredQuestionCard key={idx} uq={uq} index={idx} graph={graph} />
            ))}
          </div>
        </section>
      )}

      {/* Potentially Outdated Sources */}
      {(activeSection === "all" || activeSection === "outdated") && outdated.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Potentially Outdated Signals
          </h3>
          <div className="space-y-2">
            {outdated.map((out) => (
              <OutdatedWarningCard key={out.id} out={out} graph={graph} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── PHASE 12: EVIDENCE LINKING CARDS ──────────────────────────────────────────

function VerificationCard({
  item,
  graph,
  checked,
  onToggle,
  priorityColor,
}: {
  item: VerificationItem;
  graph: RunGraph;
  checked: boolean;
  onToggle: () => void;
  priorityColor: "rose" | "amber" | "blue";
}) {
  const [showTrace, setShowTrace] = useState(false);
  const p = getPriorityGroup(item);
  const related = item.related_findings?.length
    ? item.related_findings
    : item.related_finding
      ? [item.related_finding]
      : [];

  const sources = item.source_refs?.length ? item.source_refs : item.source_urls ?? [];

  // Match sources & snippets
  const matchedSources = useMemo(() => {
    const urls = new Set(sources);
    return graph.sources.filter((s) => s.url && urls.has(s.url));
  }, [sources, graph.sources]);

  const matchedSnippets = useMemo(() => {
    const sIds = new Set(matchedSources.map((s) => s.id));
    return graph.evidence.filter((ev) => sIds.has(ev.source_id)).slice(0, 2);
  }, [matchedSources, graph.evidence]);

  return (
    <div
      className={`card flex flex-col p-3.5 transition-colors ${
        checked ? "opacity-60 bg-bg-surface/50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={`check-${item.id}`}
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent shrink-0 cursor-pointer"
        />
        <div className="flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[length:var(--text-micro)] font-bold uppercase ${
                priorityColor === "rose"
                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                  : priorityColor === "amber"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    : "bg-blue-500/10 text-blue-400 border border-blue-500/30"
              }`}
            >
              {p}
            </span>
            {item.finding_type && (
              <span className="rounded bg-bg-surface px-1.5 py-0.5 font-mono text-[length:var(--text-micro)] uppercase text-text-muted">
                {item.finding_type.replace(/_/g, " ")}
              </span>
            )}
            <span
              className={`text-xs font-semibold ${
                checked ? "line-through text-text-muted" : "text-text-primary"
              }`}
            >
              {item.item}
            </span>
          </div>

          {item.reason && (
            <div className="text-xs text-text-muted">
              <strong className="text-text-secondary">Reason:</strong> {item.reason}
            </div>
          )}

          {related.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[length:var(--text-micro)] font-mono text-text-muted">
                Related findings:
              </span>
              {related.map((rf, i) => (
                <span
                  key={i}
                  className="rounded bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.2 font-mono text-[length:var(--text-micro)] text-rose-400 font-semibold"
                >
                  {rf}
                </span>
              ))}
            </div>
          )}

          {item.recommended_source && (
            <div className="text-xs text-text-secondary">
              <strong className="text-text-muted">Recommended source:</strong> {item.recommended_source}
            </div>
          )}

          {item.recommendation && (
            <div className="text-xs text-text-secondary leading-relaxed">
              <strong className="text-text-muted">Action:</strong> {item.recommendation}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowTrace(!showTrace)}
              className="font-mono text-[length:var(--text-micro)] text-accent hover:underline flex items-center gap-1"
            >
              {showTrace ? "Hide Evidence Trace ▴" : "Trace Evidence Chain ↘"}
            </button>
            {sources.length > 0 && (
              <span className="font-mono text-[length:var(--text-micro)] text-text-muted">
                {sources.length} source ref(s)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* PHASE 12: Trace Finding -> Evidence -> Source -> Snippet */}
      {showTrace && (
        <div className="mt-2.5 rounded border border-border bg-bg-surface p-3 space-y-2 text-xs animate-in fade-in">
          <div className="font-mono text-[length:var(--text-micro)] uppercase tracking-wider text-accent font-bold">
            Evidence Trace Chain
          </div>
          <div className="space-y-1.5 text-text-secondary">
            <div>
              <strong className="text-text-primary">1. Finding:</strong> {item.item} ({item.finding_type || "action required"})
            </div>
            <div>
              <strong className="text-text-primary">2. Authority Target:</strong> {item.recommended_source || "Official issuing authority"}
            </div>
            {matchedSources.length > 0 ? (
              <div>
                <strong className="text-text-primary">3. Linked Sources:</strong>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                  {matchedSources.map((s) => (
                    <li key={s.id} className="truncate">
                      <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>
                <strong className="text-text-primary">3. Linked Sources:</strong> None established in reviewed corpus (Unestablished gap).
              </div>
            )}
            {matchedSnippets.length > 0 && (
              <div>
                <strong className="text-text-primary">4. Relevant Evidence Snippet:</strong>
                {matchedSnippets.map((sn) => (
                  <blockquote key={sn.id} className="mt-1 rounded bg-bg-surface-elevated/70 p-2 italic border-l-2 border-accent">
                    &ldquo;{sn.snippet}&rdquo;
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InformationGapCard({ gap, graph }: { gap: InformationGap; graph: RunGraph }) {
  const [showTrace, setShowTrace] = useState(false);

  // Match tasks from plan
  const matchedTask = useMemo(() => {
    if (!graph.plans[0]?.tasks) return null;
    return graph.plans[0].tasks.find((t) =>
      gap.related_task_ids?.some((tid) => String(tid) === String(t.id)) ||
      t.query.toLowerCase().includes(gap.research_requirement.toLowerCase())
    );
  }, [gap, graph.plans]);

  return (
    <div className="card space-y-2 p-3.5 flex flex-col justify-between">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-text-primary leading-tight">
            {gap.title}
          </h4>
          <span className="shrink-0 rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 font-mono text-[length:var(--text-micro)] font-semibold uppercase text-amber-400">
            {gap.status}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-text-secondary">{gap.description}</p>
        <div className="rounded bg-bg-surface p-2 text-xs text-text-muted space-y-1">
          <div>
            <span className="font-semibold text-text-secondary">Missing requirement:</span>{" "}
            {gap.research_requirement}
          </div>
          <div>
            <span className="font-semibold text-text-secondary">Reason:</span> {gap.reason}
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-border/50">
        <div className="flex items-center justify-between font-mono text-[length:var(--text-micro)] text-text-muted">
          <span>Search attempted: {gap.search_attempted ? "Yes" : "No"}</span>
          <button
            type="button"
            onClick={() => setShowTrace(!showTrace)}
            className="text-accent hover:underline"
          >
            {showTrace ? "Hide Trace ▴" : "Trace Requirement ↘"}
          </button>
        </div>

        {showTrace && (
          <div className="mt-2 rounded bg-bg-surface p-2.5 text-xs space-y-1.5 border border-border">
            <div>
              <strong className="text-text-primary">Research Task:</strong>{" "}
              {matchedTask ? `Task ${matchedTask.id}: ${matchedTask.query}` : `Target: ${gap.research_requirement}`}
            </div>
            {matchedTask?.subtopics && matchedTask.subtopics.length > 0 && (
              <div>
                <strong className="text-text-primary">Subtopics:</strong>{" "}
                {matchedTask.subtopics.join(", ")}
              </div>
            )}
            <div>
              <strong className="text-text-primary">Coverage Verdict:</strong> 0 supporting evidence snippets located across gathered sources.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UnansweredQuestionCard({
  uq,
  index,
  graph,
}: {
  uq: UnansweredQuestion;
  index: number;
  graph: RunGraph;
}) {
  const [showTrace, setShowTrace] = useState(false);

  return (
    <div className="card space-y-2 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">
          <span className="font-mono text-xs text-accent mr-1.5">Q{index + 1}.</span>
          {uq.question}
        </p>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[length:var(--text-micro)] font-bold uppercase ${
            uq.importance === "critical"
              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              : "bg-bg-surface text-text-muted border border-border"
          }`}
        >
          {uq.importance}
        </span>
      </div>
      <p className="text-xs text-text-secondary">
        <strong>Why unanswered:</strong> {uq.reason}
      </p>
      {uq.suggested_query && (
        <div className="flex items-center gap-2 rounded bg-bg-surface px-2.5 py-1.5 text-xs text-text-muted">
          <span className="font-mono font-semibold uppercase text-accent">
            Suggested query:
          </span>
          <span className="font-mono text-text-primary selection:bg-accent">
            {uq.suggested_query}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between font-mono text-[length:var(--text-micro)] text-text-muted pt-1">
        <span>Origin: {uq.origin}</span>
        <button
          type="button"
          onClick={() => setShowTrace(!showTrace)}
          className="text-accent hover:underline"
        >
          {showTrace ? "Hide Trace ▴" : "Trace Origin ↘"}
        </button>
      </div>

      {showTrace && (
        <div className="mt-2 rounded bg-bg-surface p-2.5 text-xs space-y-1 border border-border">
          <div>
            <strong className="text-text-primary">Origin Seam:</strong> {uq.origin} (Task #{uq.related_task_id ?? 1})
          </div>
          <div>
            <strong className="text-text-primary">Target Resolution Query:</strong> {uq.suggested_query || uq.question}
          </div>
          <div>
            <strong className="text-text-primary">Trace Rationale:</strong> {uq.reason}
          </div>
        </div>
      )}
    </div>
  );
}

function OutdatedWarningCard({ out, graph }: { out: OutdatedWarning; graph: RunGraph }) {
  const [showTrace, setShowTrace] = useState(false);

  // Match sources & snippets
  const matchedSource = useMemo(() => {
    return graph.sources.find((s) => s.url === out.source_ref);
  }, [out.source_ref, graph.sources]);

  const matchedSnippets = useMemo(() => {
    if (!matchedSource) return [];
    return graph.evidence.filter((ev) => ev.source_id === matchedSource.id).slice(0, 2);
  }, [matchedSource, graph.evidence]);

  return (
    <div className="card space-y-2 p-3.5 border-l-2 border-l-amber-500">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <span className="font-mono text-[length:var(--text-micro)] font-semibold uppercase text-amber-400">
            Potentially Outdated Source
          </span>
          <h4 className="text-xs font-medium text-text-primary break-all">
            <a
              href={out.source_ref}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent hover:underline"
            >
              {matchedSource?.title || out.source_ref}
            </a>
          </h4>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[length:var(--text-micro)] font-bold uppercase ${
            out.severity?.toLowerCase() === "high"
              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}
        >
          Severity: {out.severity}
        </span>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">{out.reason}</p>
      <div className="flex flex-wrap gap-3 font-mono text-xs text-text-muted">
        {out.detected_cycle && (
          <span>
            Detected Cycle: <strong className="text-text-primary">{out.detected_cycle}</strong>
          </span>
        )}
        {out.detected_year && (
          <span>
            Detected Year: <strong className="text-text-primary">{out.detected_year}</strong>
          </span>
        )}
        {out.detected_date && (
          <span>
            Detected Date: <strong className="text-text-primary">{out.detected_date}</strong>
          </span>
        )}
      </div>
      <div className="rounded bg-bg-surface px-2.5 py-1.5 text-xs text-text-secondary">
        <strong>Recommended Action:</strong> {out.action}
      </div>

      <div className="pt-1 flex justify-end">
        <button
          type="button"
          onClick={() => setShowTrace(!showTrace)}
          className="font-mono text-[length:var(--text-micro)] text-accent hover:underline"
        >
          {showTrace ? "Hide Evidence Snippets ▴" : "Trace Source Snippets ↘"}
        </button>
      </div>

      {showTrace && (
        <div className="mt-2 rounded bg-bg-surface p-2.5 text-xs space-y-1.5 border border-border">
          <div>
            <strong className="text-text-primary">Source Title:</strong> {matchedSource?.title || out.source_ref}
          </div>
          <div>
            <strong className="text-text-primary">URL:</strong> {out.source_ref}
          </div>
          {matchedSnippets.length > 0 ? (
            <div>
              <strong className="text-text-primary">Extracted Snippets:</strong>
              {matchedSnippets.map((sn) => (
                <blockquote key={sn.id} className="mt-1 rounded bg-bg-surface-elevated/70 p-2 italic border-l-2 border-amber-500">
                  &ldquo;{sn.snippet}&rdquo;
                </blockquote>
              ))}
            </div>
          ) : (
            <div>No additional raw snippets cached for this URL.</div>
          )}
        </div>
      )}
    </div>
  );
}
