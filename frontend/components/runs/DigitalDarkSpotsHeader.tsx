"use client";

import { useMemo, useState } from "react";
import type {
  DarkSpotReport,
  RunEvidence,
  RunGraph,
  RunSource,
  VerificationItem,
} from "@/lib/types";

interface DigitalDarkSpotsHeaderProps {
  graph: RunGraph;
  onNavigateTab: (tab: "darkspots" | "evidence" | "sources" | "contradictions", opts?: { focus?: string }) => void;
}

export function DigitalDarkSpotsHeader({ graph, onNavigateTab }: DigitalDarkSpotsHeaderProps) {
  const darkspots: DarkSpotReport | null = graph.run.darkspot_report ?? null;
  const [selectedItem, setSelectedItem] = useState<VerificationItem | null>(null);

  const gaps = darkspots?.gaps ?? [];
  const unanswered = darkspots?.unanswered_questions ?? [];
  const outdated = darkspots?.outdated_warnings ?? [];
  const checklist = darkspots?.verification_checklist ?? [];
  const contradictions = graph.contradictions ?? [];

  // Group verification checklist deterministically
  const groupedChecklist = useMemo(() => {
    const high: VerificationItem[] = [];
    const medium: VerificationItem[] = [];
    const low: VerificationItem[] = [];

    for (const item of checklist) {
      const p = typeof item.priority === "string" ? item.priority.toUpperCase() : item.priority === 1 ? "HIGH" : item.priority === 2 ? "MEDIUM" : "LOW";
      if (p === "HIGH") high.push(item);
      else if (p === "MEDIUM") medium.push(item);
      else low.push(item);
    }
    return { high, medium, low };
  }, [checklist]);

  // Trace evidence collaborators for selected finding
  const tracedEvidence = useMemo(() => {
    if (!selectedItem) return null;

    const urls = new Set<string>([
      ...(selectedItem.source_refs ?? []),
      ...(selectedItem.source_urls ?? []),
    ]);

    // Find sources
    const matchedSources = graph.sources.filter(
      (s) => (s.url && urls.has(s.url)) || urls.has(s.id)
    );

    // Find matching evidence snippets
    const matchedEvidence: RunEvidence[] = [];
    for (const ev of graph.evidence) {
      if (
        matchedSources.some((s) => s.id === ev.source_id) ||
        (ev.task_id && selectedItem.related_findings?.some((rf) => rf.includes(String(ev.task_id))))
      ) {
        matchedEvidence.push(ev);
      }
    }

    return {
      sources: matchedSources,
      evidence: matchedEvidence.slice(0, 3),
    };
  }, [selectedItem, graph.sources, graph.evidence]);

  if (!darkspots && contradictions.length === 0) {
    return null;
  }

  return (
    <div className="card overflow-hidden border border-border bg-bg-surface/60 shadow-sm">
      {/* Top Banner Header */}
      <div className="flex flex-col gap-2 border-b border-border bg-bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 text-xs font-bold text-amber-400">
            ⚠
          </div>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-primary">
            DIGITAL DARK SPOTS
          </span>
          <span className="rounded bg-accent/10 px-2 py-0.5 font-mono text-[length:var(--text-micro)] text-accent border border-accent/20">
            Uncertainty & Gap Detection
          </span>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab("darkspots")}
          className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 self-start sm:self-auto"
        >
          View Full Dark Spots Report →
        </button>
      </div>

      {/* Overview Cards / Tabs Grid */}
      <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
        {/* Card 1: Gaps */}
        <button
          type="button"
          onClick={() => onNavigateTab("darkspots")}
          className="flex flex-col p-3 text-left transition-colors hover:bg-bg-surface/80 group"
        >
          <span className="font-mono text-xs text-text-muted group-hover:text-text-primary">
            Information Gaps
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold text-text-primary tabular-nums">
              {gaps.length}
            </span>
            <span className="text-xs font-medium text-amber-400">Gaps</span>
          </div>
        </button>

        {/* Card 2: Open Questions */}
        <button
          type="button"
          onClick={() => onNavigateTab("darkspots")}
          className="flex flex-col p-3 text-left transition-colors hover:bg-bg-surface/80 group"
        >
          <span className="font-mono text-xs text-text-muted group-hover:text-text-primary">
            Unanswered Questions
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold text-text-primary tabular-nums">
              {unanswered.length}
            </span>
            <span className="text-xs font-medium text-blue-400">Open</span>
          </div>
        </button>

        {/* Card 3: Conflicts */}
        <button
          type="button"
          onClick={() => onNavigateTab("contradictions")}
          className="flex flex-col p-3 text-left transition-colors hover:bg-bg-surface/80 group"
        >
          <span className="font-mono text-xs text-text-muted group-hover:text-text-primary">
            Conflicts
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold text-text-primary tabular-nums">
              {contradictions.length}
            </span>
            <span className="text-xs font-medium text-rose-400">
              {contradictions.length === 1 ? "Conflict" : "Conflicts"}
            </span>
          </div>
        </button>

        {/* Card 4: Outdated Sources */}
        <button
          type="button"
          onClick={() => onNavigateTab("darkspots")}
          className="flex flex-col p-3 text-left transition-colors hover:bg-bg-surface/80 group"
        >
          <span className="font-mono text-xs text-text-muted group-hover:text-text-primary">
            Potentially Outdated
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold text-text-primary tabular-nums">
              {outdated.length}
            </span>
            <span className="text-xs font-medium text-amber-400">Old Sources</span>
          </div>
        </button>
      </div>

      {/* WHAT TO VERIFY NEXT Section */}
      {checklist.length > 0 && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
              <span>WHAT TO VERIFY NEXT</span>
              <span className="font-normal text-[length:var(--text-micro)] text-text-muted">
                (Click any item to trace evidence)
              </span>
            </h4>
            <span className="font-mono text-[length:var(--text-micro)] text-text-muted">
              {checklist.length} actions ranked
            </span>
          </div>

          <div className="space-y-3">
            {/* HIGH PRIORITY */}
            {groupedChecklist.high.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                    <span>🔴</span> HIGH
                  </span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {groupedChecklist.high.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                      className={`flex items-start justify-between gap-2 rounded border p-2 text-left text-xs transition-colors ${
                        selectedItem?.id === item.id
                          ? "border-rose-500 bg-rose-500/10 text-text-primary"
                          : "border-border bg-bg-surface/50 text-text-secondary hover:border-border-focus hover:text-text-primary"
                      }`}
                    >
                      <span className="font-medium">{item.item}</span>
                      <span className="shrink-0 font-mono text-[length:var(--text-micro)] text-text-muted">
                        Trace ↘
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* MEDIUM PRIORITY */}
            {groupedChecklist.medium.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                    <span>🟠</span> MEDIUM
                  </span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {groupedChecklist.medium.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                      className={`flex items-start justify-between gap-2 rounded border p-2 text-left text-xs transition-colors ${
                        selectedItem?.id === item.id
                          ? "border-amber-500 bg-amber-500/10 text-text-primary"
                          : "border-border bg-bg-surface/50 text-text-secondary hover:border-border-focus hover:text-text-primary"
                      }`}
                    >
                      <span className="font-medium">{item.item}</span>
                      <span className="shrink-0 font-mono text-[length:var(--text-micro)] text-text-muted">
                        Trace ↘
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* LOW PRIORITY */}
            {groupedChecklist.low.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-400 flex items-center gap-1">
                    <span>🔵</span> LOW
                  </span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {groupedChecklist.low.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                      className={`flex items-start justify-between gap-2 rounded border p-2 text-left text-xs transition-colors ${
                        selectedItem?.id === item.id
                          ? "border-blue-500 bg-blue-500/10 text-text-primary"
                          : "border-border bg-bg-surface/50 text-text-secondary hover:border-border-focus hover:text-text-primary"
                      }`}
                    >
                      <span className="font-medium">{item.item}</span>
                      <span className="shrink-0 font-mono text-[length:var(--text-micro)] text-text-muted">
                        Trace ↘
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* PHASE 12: EVIDENCE TRACE DRAWER */}
          {selectedItem && (
            <div className="mt-3 rounded border border-accent/30 bg-bg-surface p-3.5 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-accent">
                    Finding Evidence Trace:
                  </span>
                  <span className="text-xs font-semibold text-text-primary">
                    {selectedItem.item}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  ✕ Close
                </button>
              </div>

              {/* Finding -> Evidence -> Source -> Snippet Flow */}
              <div className="space-y-2 text-xs">
                {/* 1. Finding Detail */}
                <div className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-accent shrink-0">Finding:</span>
                  <div className="text-text-secondary">
                    <p>{selectedItem.reason || "Actionable verification requirement"}</p>
                    {selectedItem.related_finding && (
                      <span className="mt-1 inline-block rounded bg-rose-500/10 px-1.5 py-0.2 font-mono text-[length:var(--text-micro)] text-rose-400">
                        {selectedItem.related_finding}
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Recommended Authority */}
                {selectedItem.recommended_source && (
                  <div className="flex items-start gap-2">
                    <span className="font-mono font-semibold text-text-muted shrink-0">
                      Authority:
                    </span>
                    <span className="text-text-primary font-medium">
                      {selectedItem.recommended_source}
                    </span>
                  </div>
                )}

                {/* 3. Source */}
                {tracedEvidence?.sources && tracedEvidence.sources.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="font-mono font-semibold text-text-muted shrink-0">Source:</span>
                    <div className="space-y-1">
                      {tracedEvidence.sources.map((s) => (
                        <div key={s.id}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-accent hover:underline font-medium"
                          >
                            {s.title || s.url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Snippet */}
                {tracedEvidence?.evidence && tracedEvidence.evidence.length > 0 ? (
                  <div className="flex items-start gap-2 pt-1">
                    <span className="font-mono font-semibold text-text-muted shrink-0">Snippet:</span>
                    <div className="space-y-1.5 w-full">
                      {tracedEvidence.evidence.map((ev) => (
                        <blockquote
                          key={ev.id}
                          className="rounded bg-bg-surface-elevated/70 p-2 text-text-secondary italic border-l-2 border-accent"
                        >
                          &ldquo;{ev.snippet}&rdquo;
                        </blockquote>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded bg-amber-500/10 p-2 text-[length:var(--text-micro)] text-amber-400">
                    No verified evidence snippets exist for this requirement (Unestablished Information Gap). Primary authority review required.
                  </div>
                )}

                {/* Action button */}
                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigateTab("darkspots")}
                    className="rounded bg-accent px-2.5 py-1 text-xs font-semibold text-accent-contrast hover:opacity-90"
                  >
                    Open in Dark Spots Panel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
