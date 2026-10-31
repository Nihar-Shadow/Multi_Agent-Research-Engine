import pytest
from research_engine.schemas import (
    DarkSpotReport,
    EpistemicClaim,
    InformationGap,
    OutdatedWarning,
    UnansweredQuestion,
    VerificationItem,
)
from research_engine.gap_detector import (
    build_coverage_matrix,
    build_verification_checklist,
    detect_deterministic_gaps,
    detect_outdated_warnings,
    insert_darkspots_block,
    render_darkspots_block,
)


def test_information_gap_schema():
    gap = InformationGap(
        title="Renewal conditions not established",
        description="The reviewed sources describe eligibility but not renewal conditions.",
        reason="No reviewed source contained renewal criteria.",
        research_requirement="Renewal criteria",
        confidence=88,  # tests coercion from 0-100 to 0-1
    )
    assert gap.confidence == 0.88
    assert gap.status == "open"
    assert gap.search_attempted is True
    data = gap.model_dump()
    assert data["title"] == "Renewal conditions not established"
    assert data["research_requirement"] == "Renewal criteria"


def test_unanswered_question_schema():
    uq = UnansweredQuestion(
        question="What are the renewal conditions?",
        why_unanswered="No sufficient evidence found across sources",  # test alias
        task_id=1,  # test alias
        importance="critical",
    )
    assert uq.reason == "No sufficient evidence found across sources"
    assert uq.related_task_id == 1
    assert uq.importance == "critical"
    assert uq.confidence == 0.9


def test_outdated_warning_schema():
    w = OutdatedWarning(
        source_url="https://example.com/guide",  # test alias
        warning="The source refers to a previous cycle",  # test alias
        detected_cycle="2025 cycle",
        staleness_risk="high",  # test alias
    )
    assert w.source_ref == "https://example.com/guide"
    assert w.reason == "The source refers to a previous cycle"
    assert w.severity == "HIGH"
    assert w.detected_cycle == "2025 cycle"


def test_verification_item_priority_normalization():
    v1 = VerificationItem(
        item="Confirm deadline",
        priority=1,  # rank integer
        recommendation="Check portal",
    )
    assert v1.priority == "HIGH"
    assert v1.priority_rank == 1

    v2 = VerificationItem(
        item="Confirm income threshold",
        priority="medium",
        recommendation="Check FAQ",
    )
    assert v2.priority == "MEDIUM"
    assert v2.priority_rank == 2

    v3 = VerificationItem(
        item="Confirm minor detail",
        priority="low",
        recommendation="Supplemental guide",
    )
    assert v3.priority == "LOW"
    assert v3.priority_rank == 3


def test_epistemic_classification_normalization():
    c1 = EpistemicClaim(
        statement="Deadline is Nov 30",
        classification="FACT",
        source_title="Official notice",
    )
    assert c1.classification == "SOURCED_FACT"

    c2 = EpistemicClaim(
        statement="Scholarship appears to require renewal",
        classification="SYNTHESIS",
        rationale="Cross-source inference",
    )
    assert c2.classification == "AI_INFERENCE"

    c3 = EpistemicClaim(
        statement="Income threshold unverified",
        classification="UNCERTAINTY",
    )
    assert c3.classification == "GAP_UNCERTAINTY"


def test_coverage_analysis_matrix():
    tasks = [
        {"id": 1, "query": "Scholarship eligibility requirements", "subtopics": ["GPA", "residency"]},
        {"id": 2, "query": "Renewal conditions and process", "subtopics": ["annual reapplication"]},
    ]
    evidence = [
        {"task_id": "1", "snippet": "Must have a 3.5 GPA and reside in state. Verified criteria for all applicants.", "source_url": "https://example.com/1"},
        {"task_id": "1", "snippet": "State residency is strictly mandatory. Must submit proof of domicile.", "source_url": "https://example.com/2"},
    ]
    coverage, matrix_text = build_coverage_matrix(
        query="Scholarship guidelines",
        tasks=tasks,
        outline=[],
        evidence=evidence,
        contradictions=[],
        outdated=[],
    )
    assert len(coverage) == 2
    # Task 1 has sufficient evidence -> COVERED
    assert coverage[0].status == "COVERED"
    # Task 2 has 0 evidence -> MISSING
    assert coverage[1].status == "MISSING"

    gaps, questions = detect_deterministic_gaps(coverage)
    assert len(gaps) == 1
    assert "Renewal conditions and process" in gaps[0].title
    assert len(questions) == 1
    assert questions[0].importance == "critical"


def test_deterministic_priority_calculation():
    gaps = [
        InformationGap(
            title="Renewal conditions not established",
            description="No sources covered renewal",
            reason="Missing renewal guidelines",
            research_requirement="renewal conditions",
        ),
        InformationGap(
            title="Income threshold unclear",
            description="Financial threshold unverified",
            reason="No exact dollar threshold provided",
            research_requirement="income threshold",
        ),
    ]
    questions = [
        UnansweredQuestion(
            question="What is the exact deadline?",
            reason="Unverified deadline",
            importance="critical",
        )
    ]
    outdated = [
        OutdatedWarning(
            source_ref="https://example.com/stale",
            claim_or_fact="Application cycle deadline",
            detected_cycle="2024 cycle",
            reason="Refers to past academic year",
            severity="HIGH",
        )
    ]
    contradictions = [
        {
            "claim_a": "Deadline is November 30",
            "claim_b": "Deadline is December 15",
            "source_a": "https://example.com/portal",
            "source_b": "https://example.com/stale",
            "nature": "Two sources give different application deadlines",
        }
    ]

    items = build_verification_checklist(gaps, questions, outdated, contradictions)

    # Must be sorted by priority: HIGH first, then MEDIUM, then LOW
    priorities = [item.priority for item in items]
    assert priorities[0] == "HIGH"

    # Contradiction + outdated link test
    contra_items = [i for i in items if i.category == "contradiction"]
    assert len(contra_items) == 1
    assert contra_items[0].priority == "HIGH"
    assert "Contradiction #1" in contra_items[0].related_findings
    assert "Outdated warning #1" in contra_items[0].related_findings
    assert contra_items[0].recommended_source == "Official scholarship notice"

    # Income gap must be MEDIUM
    income_items = [i for i in items if "income" in i.item.lower()]
    assert len(income_items) == 1
    assert income_items[0].priority == "MEDIUM"


def test_report_structure_and_citation_preservation():
    initial_report = (
        "# Scholarship Research Report\n\n"
        "## Executive Summary\n"
        "The scholarship provides tuition assistance for eligible undergraduates [1].\n\n"
        "## Key Findings\n"
        "Applicants must maintain satisfactory academic progress [1][2].\n\n"
        "## Sources\n"
        "[1] https://example.com/portal\n"
        "[2] https://example.com/guide\n"
    )

    darkspots = DarkSpotReport(
        gaps=[
            InformationGap(
                title="Renewal conditions not established",
                description="Reviewed sources do not establish renewal conditions.",
                reason="Renewal criteria were not found in reviewed sources.",
            )
        ],
        unanswered_questions=[
            UnansweredQuestion(
                question="What are the renewal requirements?",
                reason="No evidence retrieved across sources.",
            )
        ],
        outdated_warnings=[
            OutdatedWarning(
                source_ref="https://example.com/guide",
                claim_or_fact="Application deadline 2025 cycle",
                detected_cycle="2025 cycle",
                reason="The source refers to a previous application cycle.",
                severity="HIGH",
            )
        ],
        verification_checklist=[
            VerificationItem(
                item="Confirm current application deadline",
                priority="HIGH",
                reason="Sources contain different deadlines and one source refers to an older cycle.",
                related_finding="Contradiction #1, Outdated warning #1",
                recommended_source="Official scholarship notice",
            ),
            VerificationItem(
                item="Confirm renewal requirements",
                priority="HIGH",
                reason="Renewal conditions were not established in reviewed sources.",
                related_finding="Information Gap: Renewal criteria",
                recommended_source="Official scholarship notice",
            ),
            VerificationItem(
                item="Confirm income threshold",
                priority="MEDIUM",
                reason="Income threshold specifications missing from retrieved articles.",
                recommended_source="Program FAQ",
            ),
        ],
    )

    block = render_darkspots_block(darkspots)
    extended_report = insert_darkspots_block(initial_report, block)

    # Invariants verification:
    # 1. Existing report headers preserved
    assert "## Executive Summary" in extended_report
    assert "## Key Findings" in extended_report
    # 2. Existing citations [1] and [2] intact
    assert "[1]" in extended_report
    assert "[2]" in extended_report
    # 3. Sources section is after Dark Spots block
    sources_idx = extended_report.index("## Sources")
    darkspots_idx = extended_report.index("## Information Gaps & Unresolved Questions")
    assert darkspots_idx < sources_idx
    # 4. Correct section headings rendered
    assert "### Information Gaps" in extended_report
    assert "### Unanswered Questions" in extended_report
    assert "## Potentially Outdated Information" in extended_report
    assert "## What to Verify Next" in extended_report
    assert "### HIGH PRIORITY" in extended_report
    assert "### MEDIUM PRIORITY" in extended_report
    assert "□ Confirm current application deadline" in extended_report
    assert "□ Confirm renewal requirements" in extended_report
    assert "□ Confirm income threshold" in extended_report
