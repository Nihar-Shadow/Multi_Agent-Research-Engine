# Frontend — Multi-Agent Research Assistant & Digital Dark Spot Dashboard

> Next.js 16 (App Router), React 19, Tailwind CSS v4, and TanStack Query v5.

The user interface for the Multi-Agent Research Assistant. It provides real-time streaming updates of multi-agent execution, human-in-the-loop design & review gates, interactive per-claim citation chips, the Digital Dark Spots intelligence dashboard ("What to Verify Next"), grounded follow-up chat, private document corpus management, and multi-provider settings.

---

## Build Targets

The frontend compiles to three distinct build targets:

| Target | Command | Output & Purpose |
|---|---|---|
| **Web Server (Default)** | `npm run build` | Standalone Node/Docker server image with same-origin `/api` proxying. |
| **Desktop App (Tauri)** | `npm run build:desktop` | Static export (`out/`) bundled into the cross-platform desktop application. |
| **Documentation Site** | `npm run build:pages` | Static export for GitHub Pages hosting [`docs/`](../docs/00_INDEX.md). |

Before building or developing, `scripts/prepare-session-routes.mjs` links the appropriate route handlers for the target environment.

---

## Getting Started

### Prerequisites

- Node.js 26+
- npm (or pnpm / yarn)
- Backend API running on `http://localhost:8000` (or started via `./start.sh` / `make infra-up`)

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3031](http://localhost:3031) in your browser.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Prepares session routes and starts Next.js dev server on port `3031` |
| `npm run build` | Builds optimized standalone production web app |
| `npm run build:desktop` | Builds static export for the Tauri desktop application |
| `npm run build:pages` | Builds static export for GitHub Pages documentation site |
| `npm test` | Runs unit and component test suite via Vitest |
| `npm run test:watch` | Runs Vitest in interactive watch mode |
| `npm run typecheck` | Runs TypeScript compiler checks (`tsc --noEmit`) |
| `npm run lint` | Lints JavaScript and TypeScript via ESLint |
| `npm run e2e` | Runs end-to-end integration tests using Playwright |

---

## Project Structure

```
frontend/
├── app/                  # Next.js App Router routes
│   ├── (app)/            # Authenticated application shell (dashboard, research, corpus, settings)
│   ├── (auth)/           # Authentication routes (login, register)
│   ├── (site)/           # Public landing and documentation routes
│   └── layout.tsx        # Root layout with theme and query providers
├── components/           # Reusable React components
│   ├── account/          # BYOK key cards, connection health, model selectors
│   ├── corpus/           # Document upload queue and preview inspector
│   ├── research/         # Research form, depth selection, provider pickers
│   ├── runs/panels/      # Run view panels (DarkSpotsPanel, ReportPanel, EvidencePanel, etc.)
│   ├── session/          # LiveFeed, PipelineRail, PlanGate, ReportView, citation chips
│   ├── settings/         # Settings search and configuration panels
│   └── ui/               # Shared base UI components
├── hooks/                # React hooks (queries, mutations, SSE stream listeners)
├── lib/                  # Utilities, API client, SSE parsers, citation logic, types
├── scripts/              # Build-time routing and static export preparation scripts
└── styles/               # Global styling, design system tokens, CSS variables
```

---

## Architectural & Security Invariants

1. **Digital Dark Spots Intelligence Dashboard (`DarkSpotsPanel.tsx`):**
   - **Metric Cards:** Visual counters for Information Gaps, Unanswered Questions, Source Conflicts, and Outdated Sources.
   - **What to Verify Next:** Prioritized action items (`HIGH`, `MEDIUM`, `LOW`) detailing reasons, related findings, and recommended primary sources.
   - **Three-Way Epistemic Claims:** Direct UI badges distinguishing 🟢 Sourced Fact, 🟡 Open Question, and ⚪ Unverified Claim.
   - **Traceability:** Full source linking and requirement-grounded coverage analysis.
2. **No `dangerouslySetInnerHTML` or `rehype-raw`:** Model-generated Markdown is rendered safely through React Markdown without raw HTML interpolation.
3. **Design Tokens:** All colors and surface styles use CSS variables from `app/globals.css` with semantic classes supporting Light and Dark modes (`next-themes`).
4. **First-Party Authentication:** Authentication uses `httpOnly` secure cookies with token rotation. No sensitive auth tokens are stored in `localStorage`.
5. **Same-Origin API Proxy:** The web client communicates with the backend via `/api/*` proxies, avoiding cross-origin preflights and keeping cookies first-party.
