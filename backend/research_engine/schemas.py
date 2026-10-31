"""
Structured I/O contracts for the agent pipeline (docs/architecture/04-agent-architecture.md §2).

Every LLM boundary is validated against one of these models. Parse/validation
failure is a node failure — never a silent fallback (docs/11 §1 rule 2).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from research_engine.runconfig import get_run_config

TaskStatus = Literal["pending", "running", "passed", "failed"]


class ResearchTask(BaseModel):
    id: int | str = 0
    query: str = Field(min_length=3, description="A concrete, independently searchable query")
    rationale: str = ""
    status: TaskStatus = "pending"
    # Plan gate fields (internal/07 Phase 4). Absent/empty is the exact shape a task
    # had before this field existed, so a run that skips the gate is unaffected.
    subtopics: list[str] = Field(default_factory=list)
    # False means the reviewer dropped this task at the gate — plan_gate_node filters
    # these out before the executor ever sees the list. True (the default) is what
    # every task effectively was before this field existed: nothing was ever excluded.
    include: bool = True
    source_hint: str | None = None

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v):
        if isinstance(v, str):
            digits = "".join(c for c in v if c.isdigit())
            if digits:
                return int(digits)
        return v or 0


class OutlineSection(BaseModel):
    """One section of the proposed report structure (internal/07 Phase 4)."""

    title: str = Field(min_length=1)
    description: str = ""


class PlannerOutput(BaseModel):
    tasks: list[ResearchTask]
    proposed_outline: list[OutlineSection] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _wrap_list(cls, data: Any) -> Any:
        if isinstance(data, list):
            return {"tasks": data}
        return data

    @field_validator("tasks")
    @classmethod
    def _bounded(cls, v: list[ResearchTask]) -> list[ResearchTask]:
        if not v:
            raise ValueError("planner must produce at least 1 task")
        # A default, not a wall (internal/07 Phase 4) — the plan gate is what lets a
        # user raise this per-run by adding tasks themselves; the configured cap is
        # only what the *planner* may propose unprompted. 6 reproduces today's
        # hardcoded ceiling exactly.
        cap = get_run_config().max_planner_tasks
        if len(v) > cap:
            v = v[:cap]
        # Normalize ids to 1..n so downstream tagging is stable.
        for i, t in enumerate(v, start=1):
            t.id = i
        return v


class EvidenceChunk(BaseModel):
    task_id: int = 0
    # Required, and it must stay required. A chunk with no URL still validates if this
    # carries a default, so it reaches `state["evidence"]` and makes the list non-empty —
    # and non-empty is the exact predicate `route_after_critic` and `_no_research_reason`
    # use to decide the run has something to report. Sourceless chunks would then count as
    # evidence and carry an uncitable run into synthesis. The alias normalisation below is
    # the right way to be generous to loosely-shaped model output; a default is not.
    source_url: str
    source_title: str = ""
    snippet: str = Field("", max_length=500, description="Verbatim supporting text")
    key_fact: str = Field("", description="The claim this snippet supports")
    retrieved_at: str = ""

    @model_validator(mode="before")
    @classmethod
    def _normalize_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "source_url" not in data:
                for k in ("url", "link", "source"):
                    if k in data and isinstance(data[k], str):
                        data["source_url"] = data[k]
                        break
            if "key_fact" not in data:
                for k in ("fact", "claim", "title"):
                    if k in data and isinstance(data[k], str):
                        data["key_fact"] = data[k]
                        break
            if "snippet" not in data:
                for k in ("quote", "text", "content"):
                    if k in data and isinstance(data[k], str):
                        data["snippet"] = data[k]
                        break
        return data


class ExecutorOutput(BaseModel):
    task_id: int | str = 0
    evidence: list[EvidenceChunk] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _wrap_list(cls, data: Any) -> Any:
        if isinstance(data, list):
            return {"evidence": data}
        return data


class CriticVerdict(BaseModel):
    passed: bool
    confidence: float = Field(0.5, ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list)
    feedback_for_executor: str | None = None

    @field_validator("confidence", mode="before")
    @classmethod
    def _normalize_confidence(cls, v):
        # Models routinely express confidence as a 0–100 percentage (e.g. 60) rather
        # than a 0–1 probability. Coerce and clamp instead of rejecting: a benign scale
        # difference must not discard an otherwise-valid verdict (or, worse, crash the
        # run). Non-numeric input falls back to the neutral default.
        try:
            f = float(v)
        except (TypeError, ValueError):
            return 0.5
        if f > 1.0:
            f = f / 100.0
        return min(max(f, 0.0), 1.0)

    @field_validator("feedback_for_executor")
    @classmethod
    def _feedback_required_on_fail(cls, v: str | None, info) -> str | None:
        # When a verdict fails, the executor needs something actionable.
        if info.data.get("passed") is False and not (v and v.strip()):
            return "Insufficient evidence; gather more independent, well-cited sources."
        return v


class Source(BaseModel):
    """A numbered citation the UI renders (docs/05 §1 — sessions.sources).

    A single page routinely supports several distinct facts, and the executor extracts a
    separate verbatim snippet for each. Keeping only one of them — as this schema did
    until docs/12 M5 defect D3 — meant a citation chip could show a snippet that had
    nothing to do with the sentence it was attached to, since the same source is cited
    for ~8 different claims on average. That quietly broke the product's central promise:
    hover a citation, read the text that backs *this* claim.

    So `snippets` holds every distinct snippet extracted from the source. `snippet` is
    retained as the first one for backward compatibility with `sessions.sources` rows
    written before the fix and with any client reading the old shape.
    """

    index: int
    url: str
    title: str = ""
    snippet: str = ""
    snippets: list[str] = Field(default_factory=list)


class ContradictionPair(BaseModel):
    """One direct conflict between two sources (docs/12 M11).

    Both claims must be quoted from the snippets the detector was shown — the
    validator in `contradictions.py` drops any pair whose source URL was not in
    the evidence, so a hallucinated or injected source can never reach the report.
    """

    claim_a: str = Field(
        max_length=400,
        description="One-sentence restatement of the first side of the conflict, in your own words",
    )
    snippet_a: str = Field(
        "",
        max_length=500,
        description="The VERBATIM quoted snippet text from the source that supports claim_a — copy it exactly as shown between the quotation marks, never a URL",
    )
    source_a: str = Field(
        description="The source URL for claim_a — copy the bare URL exactly as it appears after 'Source:' with no prefix, no 'Source:' label, no extra text"
    )
    claim_b: str = Field(
        max_length=400,
        description="One-sentence restatement of the second side of the conflict, in your own words",
    )
    snippet_b: str = Field(
        "",
        max_length=500,
        description="The VERBATIM quoted snippet text from the source that supports claim_b — copy it exactly as shown between the quotation marks, never a URL",
    )
    source_b: str = Field(
        description="The source URL for claim_b — copy the bare URL exactly as it appears after 'Source:' with no prefix, no 'Source:' label, no extra text"
    )
    nature: str = Field(
        "", max_length=400, description="One sentence: why they cannot both be true"
    )


class ContradictionReport(BaseModel):
    """The detector's structured output. `pairs` is capped, not rejected, on overflow:
    surfacing ten real conflicts and dropping two is strictly better than failing the
    whole check because a model was prolific."""

    pairs: list[ContradictionPair] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _wrap_list(cls, data: Any) -> Any:
        if isinstance(data, list):
            return {"pairs": data}
        return data

    @field_validator("pairs")
    @classmethod
    def _cap(cls, v: list[ContradictionPair]) -> list[ContradictionPair]:
        return v[:10]


# ── Digital Dark Spot (Information Gap Detection) ────────────────────────────────


def _normalize_prob(v: Any, default: float = 0.8) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if f > 1.0:
        f = f / 100.0
    return min(max(f, 0.0), 1.0)


class InformationGap(BaseModel):
    """An important piece of information required by the research objective that was
    not established by the reviewed evidence (Digital Dark Spot).

    Never a generic 'more research needed' hedge — an explicit missing requirement.
    """

    id: str = ""
    title: str = Field(..., min_length=3, description="Concise summary of the missing information")
    description: str = Field(
        ..., description="What was reviewed vs what remained unestablished"
    )
    reason: str = Field(
        ..., description="Concrete reason the evidence failed to establish this fact"
    )
    research_requirement: str = Field(
        default="", description="The specific question requirement this gap impacts"
    )
    search_attempted: bool = True
    confidence: float = Field(0.85, ge=0.0, le=1.0)
    related_task_ids: list[int | str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)
    status: Literal["open", "partially_covered", "resolved"] = "open"

    @field_validator("confidence", mode="before")
    @classmethod
    def _coerce_confidence(cls, v):
        return _normalize_prob(v, default=0.85)


class UnansweredQuestion(BaseModel):
    """A materially relevant question originating from the research objective, planner
    sub-questions, or tasks that could not be established by the retrieved evidence.

    Does NOT include every failed search attempt — only questions that are materially
    relevant to the user's research objective.
    """

    id: str = ""
    question: str = Field(..., min_length=3, description="Specific unanswered question")
    reason: str = Field(
        default="No sufficient evidence found",
        description="Why this question remains unanswered based on gathered evidence",
    )
    confidence: float = Field(0.9, ge=0.0, le=1.0)
    related_task_id: int | str | None = None
    source_refs: list[str] = Field(default_factory=list)
    origin: Literal[
        "research_question", "planner_subtopic", "research_task", "evidence_gap"
    ] = "planner_subtopic"
    suggested_query: str = Field(
        default="", description="Targeted follow-up search query to locate this information"
    )
    importance: Literal["critical", "high", "medium", "low"] = "high"

    @model_validator(mode="before")
    @classmethod
    def _normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Support why_unanswered as alias for reason
            if "reason" not in data and "why_unanswered" in data:
                data["reason"] = data["why_unanswered"]
            if "related_task_id" not in data and "task_id" in data:
                data["related_task_id"] = data["task_id"]
        return data

    @field_validator("confidence", mode="before")
    @classmethod
    def _coerce_confidence(cls, v):
        return _normalize_prob(v, default=0.9)


class OutdatedWarning(BaseModel):
    """A source or claim referencing time-sensitive data that may be potentially outdated or superseded."""

    id: str = ""
    source_ref: str = Field(..., description="The source URL or title providing the dated fact")
    claim_or_fact: str = Field(default="", description="The factual claim that may be outdated")
    detected_date: str = Field(default="", description="Publication, revision, or observation date")
    detected_year: int | str | None = None
    detected_cycle: str = Field(default="", description="e.g. '2024 cycle', '2025 cycle'")
    reason: str = Field(..., description="Why this information is potentially outdated")
    severity: Literal["HIGH", "MEDIUM", "LOW"] = "MEDIUM"
    confidence: float = Field(0.85, ge=0.0, le=1.0)
    action: str = Field(
        default="Verify against the latest official source or notice.",
        description="Recommended action for reviewer",
    )

    @model_validator(mode="before")
    @classmethod
    def _normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "source_ref" not in data and "source_url" in data:
                data["source_ref"] = data["source_url"]
            if "reason" not in data and "warning" in data:
                data["reason"] = data["warning"]
            if "severity" in data and isinstance(data["severity"], str):
                val = data["severity"].upper()
                data["severity"] = val if val in ("HIGH", "MEDIUM", "LOW") else "MEDIUM"
            elif "staleness_risk" in data and isinstance(data["staleness_risk"], str):
                val = data["staleness_risk"].upper()
                data["severity"] = val if val in ("HIGH", "MEDIUM", "LOW") else "MEDIUM"
        return data

    @field_validator("confidence", mode="before")
    @classmethod
    def _coerce_confidence(cls, v):
        return _normalize_prob(v, default=0.85)


class VerificationItem(BaseModel):
    """An action item in the prioritized verification checklist for human adjudication (Phase 8)."""

    id: str = ""
    item: str = Field(..., description="Actionable verification assertion or check")
    priority: Literal["HIGH", "MEDIUM", "LOW"] = "HIGH"
    priority_rank: int = Field(default=1, ge=1, le=10, description="Priority ranking (1 is highest)")
    category: Literal[
        "contradiction",
        "information_gap",
        "outdated_data",
        "unverified_claim",
        "inference",
    ] = "information_gap"
    finding_type: str = Field(default="missing_requirement", description="Type of underlying dark spot finding")
    recommendation: str = Field(default="", description="Actionable verification instruction")
    reason: str = Field(default="", description="Why this verification is necessary")
    related_finding: str = Field(default="", description="Reference to finding e.g. Contradiction #N or Gap ID")
    related_findings: list[str] = Field(default_factory=list, description="All associated finding references")
    source_refs: list[str] = Field(default_factory=list, description="Referenced source URLs or titles")
    recommended_source: str = Field(
        default="Official authority notice or primary portal",
        description="Recommended authoritative source to check",
    )
    status: Literal["pending", "verified", "flagged"] = "pending"
    source_urls: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _normalize_verification_item(cls, data: Any) -> Any:
        if isinstance(data, dict):
            p = data.get("priority", "HIGH")
            if isinstance(p, int):
                data["priority_rank"] = p
                data["priority"] = "HIGH" if p == 1 else ("MEDIUM" if p == 2 else "LOW")
            elif isinstance(p, str):
                p_up = p.upper().strip()
                if p_up in ("HIGH", "MEDIUM", "LOW"):
                    data["priority"] = p_up
                    data["priority_rank"] = 1 if p_up == "HIGH" else (2 if p_up == "MEDIUM" else 3)
                else:
                    data["priority"] = "HIGH"
                    data["priority_rank"] = 1
            urls = data.get("source_urls") or data.get("source_refs") or []
            data["source_urls"] = urls
            data["source_refs"] = urls
            rf = data.get("related_finding")
            rfs = data.get("related_findings") or []
            if rf and rf not in rfs:
                rfs = [rf, *rfs]
            data["related_findings"] = rfs
            if not data.get("recommendation") and data.get("action"):
                data["recommendation"] = data["action"]
        return data


class EpistemicClaim(BaseModel):
    """Epistemic classification separating raw facts, synthesized deductions, and uncertainties (Phase 9)."""

    statement: str = Field(..., description="The individual statement or assertion")
    classification: Literal["SOURCED_FACT", "AI_INFERENCE", "GAP_UNCERTAINTY"] = "SOURCED_FACT"
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    source_indices: list[int] = Field(default_factory=list)
    source_title: str | None = None
    source_url: str | None = None
    supporting_snippets: list[str] = Field(default_factory=list)
    rationale: str = Field(default="", description="Why this statement was assigned this classification")

    @model_validator(mode="before")
    @classmethod
    def _normalize_classification(cls, data: Any) -> Any:
        if isinstance(data, dict):
            c = str(data.get("classification", "SOURCED_FACT")).upper().strip()
            if c in ("FACT", "SOURCED_FACT"):
                data["classification"] = "SOURCED_FACT"
            elif c in ("AI_INFERENCE", "INFERENCE", "SYNTHESIS"):
                data["classification"] = "AI_INFERENCE"
            else:
                data["classification"] = "GAP_UNCERTAINTY"
            # Support claim as alias for statement
            if "statement" not in data and "claim" in data:
                data["statement"] = data["claim"]
        return data

    @field_validator("confidence", mode="before")
    @classmethod
    def _coerce_confidence(cls, v):
        return _normalize_prob(v, default=0.9)


class DarkSpotReport(BaseModel):
    """Structured report produced by the Dark Spot detector."""

    gaps: list[InformationGap] = Field(default_factory=list)
    unanswered_questions: list[UnansweredQuestion] = Field(default_factory=list)
    outdated_warnings: list[OutdatedWarning] = Field(default_factory=list)
    verification_checklist: list[VerificationItem] = Field(default_factory=list)
    epistemic_claims: list[EpistemicClaim] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _wrap_obj(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Ensure missing lists default cleanly
            for k in ("gaps", "unanswered_questions", "outdated_warnings", "verification_checklist", "epistemic_claims"):
                if k not in data or data[k] is None:
                    data[k] = []
        return data

