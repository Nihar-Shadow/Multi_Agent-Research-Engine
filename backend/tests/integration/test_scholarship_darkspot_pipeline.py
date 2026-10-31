import asyncio
import httpx
import pytest

from desktop.sidecar import create_sidecar_app
from research_engine import bundle, verify_bundle

TOKEN = "test-darkspot-token"


@pytest.fixture
async def sidecar(tmp_path):
    app = create_sidecar_app(data_dir=tmp_path, token=TOKEN, fake=True)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:9") as client:
            yield client


def _auth() -> dict:
    return {"Authorization": f"Bearer {TOKEN}"}


async def _until(client: httpx.AsyncClient, session_id: str, want: str, timeout: float = 30.0):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        resp = await client.get(f"/api/v1/research/{session_id}", headers=_auth())
        assert resp.status_code == 200
        body = resp.json()
        if body["status"] == want:
            return body
        assert body["status"] != "FAILED" or want == "FAILED", (
            f"session failed while waiting for {want}: {body.get('error_message')}"
        )
        await asyncio.sleep(0.2)
    raise AssertionError(f"session never reached {want}")


@pytest.mark.asyncio
async def test_scholarship_darkspot_pipeline_e2e(sidecar):
    """Phase 14 & 15: Full scholarship test case driven through all stages to completion."""
    client = sidecar

    # 1. Start research with Phase 14 question
    start = await client.post(
        "/api/v1/research",
        headers=_auth(),
        json={
            "query": "What should I verify before applying for a scholarship?",
            "depth": "fast",
            "skip_plan_gate": False,
        },
    )
    assert start.status_code == 202
    session_id = start.json()["session_id"]

    # 2. Plan Gate (AWAITING_PLAN)
    detail = await _until(client, session_id, "AWAITING_PLAN")
    assert not detail.get("draft_report"), "nothing is drafted before the plan is approved"

    proposal = await client.get(f"/api/v1/research/{session_id}/plan", headers=_auth())
    assert proposal.status_code == 200
    tasks = proposal.json()["tasks"]
    assert len(tasks) >= 2, "planner must produce research requirements"

    # 3. Approve Plan
    submitted = await client.post(
        f"/api/v1/research/{session_id}/plan",
        headers=_auth(),
        json={
            "tasks": tasks,
            "outline": [
                {"title": "Scholarship Eligibility", "description": "Basic eligibility"},
                {"title": "Application Requirements", "description": "Documents and deadlines"},
            ],
        },
    )
    assert submitted.status_code == 200

    # 4. Human Review Gate (after executor -> critic -> gap_detector -> synthesizer)
    detail = await _until(client, session_id, "AWAITING_APPROVAL")
    assert detail["draft_report"]
    assert detail.get("darkspot_report") is not None
    darkspots = detail["darkspot_report"]

    # 5. Assert Digital Dark Spot findings
    assert len(darkspots["gaps"]) >= 1
    assert any("renewal" in g["title"].lower() for g in darkspots["gaps"])

    assert len(darkspots["unanswered_questions"]) >= 1
    assert any("renewal" in q["question"].lower() for q in darkspots["unanswered_questions"])

    assert len(darkspots["outdated_warnings"]) >= 1
    assert darkspots["outdated_warnings"][0]["detected_cycle"] == "2025 cycle"

    checklist = darkspots["verification_checklist"]
    assert len(checklist) >= 3

    # Check high priority items
    high_items = [c for c in checklist if c["priority"] == "HIGH"]
    assert len(high_items) >= 2
    # Check deadline confirmation
    assert any("deadline" in c["item"].lower() for c in high_items)
    # Check renewal confirmation
    assert any("renewal" in c["item"].lower() for c in high_items)

    # Check medium priority items (e.g. income threshold)
    med_items = [c for c in checklist if c["priority"] == "MEDIUM"]
    assert len(med_items) >= 1

    # Check traceability fields
    for item in checklist:
        assert item["reason"] != ""
        assert item["finding_type"] != ""
        assert item["recommended_source"] != ""

    # Check report content and markdown extension
    report_md = detail["draft_report"]
    assert "## Information Gaps & Unresolved Questions" in report_md
    assert "### Information Gaps" in report_md
    assert "### Unanswered Questions" in report_md
    assert "## What to Verify Next" in report_md
    assert "### HIGH PRIORITY" in report_md
    assert "### MEDIUM PRIORITY" in report_md

    # In-text [n] citations preserved
    assert "[1]" in report_md

    # 6. Approve final report
    approve = await client.post(
        f"/api/v1/research/{session_id}/approve",
        headers=_auth(),
        json={"approved": True},
    )
    assert approve.status_code == 200

    # 7. Verify Completion
    done = await _until(client, session_id, "COMPLETED")
    assert done["status"] == "COMPLETED"
    assert done["final_report"] is not None

    # 8. Verify Bundle Export
    export_resp = await client.get(
        f"/api/v1/research/{session_id}/export.bundle.json",
        headers=_auth(),
    )
    assert export_resp.status_code == 200
    manifest = bundle.BundleManifest.model_validate_json(export_resp.text)
    result = verify_bundle.verify(manifest)
    failed = [c.name for c in result.checks if not c.passed]
    assert result.passed, f"scholarship bundle failed verification: {failed}"
    assert manifest.report
