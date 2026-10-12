# Org chart and org design software: competitive landscape as of Oct 2026, mapped against OrgFlow

Method note: direct fetches of vendor sites (charthop.com, functionly.com, organimi.com, workleap.com, businesswire.com, orgplease.com) were blocked from this research environment (DNS or proxy 403). Findings below come from web-search result extracts of vendor pages, press releases, help centers and review aggregators (G2, Capterra, GetApp, PricingSaaS, CostBench). Aggregator prices often conflict. Where they do, every figure is listed. Treat all prices as indicative and confirm them on the vendor's pricing page before quoting them.

OrgFlow baseline (from `_product_context.md`): local-first browser and desktop app plus an optional self-hosted Node/SQLite host. It has positions separate from people, scenarios with a decision workflow (Draft → Applied), a dated timeline, a 1–36 month headcount/FTE/cost forecast, declared skills, seating plans, OIDC, scoped API tokens, a REST API, an MCP server, a CLI, agent skills, CSV import with mapping profiles, hybrid-work planning (work location, vacation approval, desk booking) and a Microsoft Teams tab and bot. It has no HRIS connectors, no SCIM, no Slack or Google integration, no mobile app, no compensation planning, no analytics dashboards, no in-UI AI assistant and no hosted SaaS.

## 1. Competitors: headline features, target segment and published pricing

### Takeaway
The market splits into four tiers:
1. **Lightweight chart and directory tools** (Organimi, Pingboard, Sift, OrgChart Now, Lucid). Roughly $1.50–$5 per employee per month, or flat tiers from about $100–$400 a month.
2. **Mid-market "people data plus planning" platforms** (ChartHop, Functionly). Per-employee core plan plus paid add-ons, or per editor seat.
3. **Enterprise org design and strategic workforce planning** (Orgvue, Nakisa, Ingentis, Agentnoon, now part of Dayforce). Quote-only, typically five to six figures a year.
4. **HRIS/HCM and Microsoft 365 built-in charts.** Effectively free with the suite, so they set the baseline expectation for a basic chart.

Almost nobody publishes enterprise prices, and AI tiers are quote-only.

### Cited Findings

**ChartHop** (mid-market people-data platform; org chart plus HRIS-lite, headcount planning, compensation, performance)
- Core plan reported at $5 per employee per month. Add-ons: HRIS, Headcount Planning, Compensation and Performance at $4 each; Engagement and Goals at $3. No free tier. CostBench data checked Aug 2026 — [PricingSaaS](https://pricingsaas.com/companies/charthop); [CostBench](https://www.costbench.com/software/workforce-analytics/charthop/); [Rework](https://resources.rework.com/tools/workforce-management/best-charthop-alternatives)
- Conflicting figures: Toolradar lists Core at $8 and Pro at $16 per employee per month — [Toolradar](https://toolradar.com/tools/charthop/pricing). Capterra lists "Basic" at $2 per user per month, likely stale — [Capterra](https://www.capterra.com/p/201072/ChartHop/pricing/)
- CostBench reports a $9,000 minimum commitment and 3–7% annual uplifts. This is a single unverified source — [CostBench hidden costs](https://costbench.com/software/workforce-analytics/charthop/hidden-costs/)
- ChartHop AI Pro (launched 24 Mar 2026) is quote-only — [PricingSaaS](https://pricingsaas.com/companies/charthop); [BusinessWire](https://www.businesswire.com/news/home/20260324185252/en/ChartHop-Launches-AI-Pro)
- Has an Impact Dashboard inside custom scenarios showing headcount and cost deltas against the current org. Cost figures are filtered by the viewer's compensation visibility. Alpha feature — [ChartHop docs](https://docs.charthop.com/impact-dashboard)
- July 2025 update: Matrix Teams, Data Explorer (bubble chart, alpha), and mobile forms and time off — [ChartHop July 2025 update](https://www.charthop.com/resources/charthop-product-updates-july-2025)

**Orgvue** (enterprise org design and strategic workforce planning)
- No public pricing; quote after a demo; no self-serve trial — [ERP Research](https://erpresearch.com/erp-add-ons/hcm-extensions/orgvue); [PulseSignal](https://getpulsesignal.com/pricing/orgvue)
- ITQlick estimates first-year cost at $10k–$75k for SMB and often more than $100k for enterprise — [ITQlick](https://www.itqlick.com/compare/orgvue/workday)
- UK G-Cloud 14 listing gives a price range of £65,000–£9,999,999 per unit — [Digital Marketplace](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/426303922263495)

**Workleap Pingboard** (SMB and mid-market org chart plus employee directory)
- Workleap acquired Pingboard in Dec 2023. Pingboard is now part of the Workleap employee-experience suite — [PR Newswire](https://www.prnewswire.com/news-releases/workleap-acquires-us-based-pingboard-an-employee-experience-saas-company-recognized-for-its-industry-leading-org-chart-and-employee-directory-capabilities-302006681.html); [Workleap](https://workleap.com/pingboard)
- Features: automated HRIS integrations or Excel upload, with changes reflected automatically — [Workleap migration FAQ](https://help.workleap.com/en/articles/10436716-pingboard-migration-faq). Slack alerts, daily summaries and DMs from profiles — [Pingboard integrations](https://pingboard.com/integrations)
- Pricing conflicts across sources:
  - About $4–5 per user per month, plus a free org chart tier — [Spendbase](https://www.spendbase.co/?p=33503)
  - Standard $4,999 a year, Pro $11,999 a year, Enterprise custom; no free tier as of May 2026 — [xpay](https://www.xpay.sh/saas-pricing/pingboard/)
  - Standard $416.58 a month, Pro $999.92 a month — [PricingSaaS](https://pricingsaas.com/companies/pingboard)
  - From $149 a month; rated 4.6/5 from 595 reviews — [Capterra](https://www.capterra.com/p/212284/Pingboard/pricing/)
- Pingboard's CEO said older plans would be sunset, raising prices for some customers — [Pingboard blog](https://pingboard.com/blog/an-update-from-our-ceo). A competitor cites a single anonymous customer going from $4,800 to more than $19,000 a year. This is biased marketing — [Steegle.One](https://one.steegle.com/blog/pingboard-alternative-workleap-price-increase)

**Lucid (Lucidchart)** (general diagramming used for org charts)
- Free tier: 3 documents and 60 shapes. Individual about $9 a month; Team about $10 per user per month; Enterprise custom — [aisotools](https://aisotools.com/pricing/lucidchart); [Capterra](https://www.capterra.com/p/146136/Lucidchart/)
- The named HRIS integration is BambooHR. One review says Lucidchart has no live connection to people data, so charts need a manual re-import (CSV) — [Zapier](https://zapier.com/blog/best-org-chart-software/); [OrgChartStudio, competitor blog](https://www.orgchartstudio.com/blog/best-org-chart-software)

**Functionly** (SMB to mid-market org design; consultants)
- Priced per editor seat, with unlimited people and positions. Starter is $29 a month for 3 seats (monthly), extra seats $48 per seat per month. Enterprise is 20+ seats at $79 per seat per month (annual) — [Functionly](https://www.functionly.com/org-chart-software-0)
- Conflicting figures: G2 lists $72 a month for 3 seats — [G2](https://www.g2.com/compare/functionly-vs-orgchart). Capterra lists from $144 a month — [Capterra](https://www.capterra.com/p/208681/Functionly/). An older page shows a $0 free plan — [Functionly free](https://www.functionly.com/free)
- OrgPilot is an AI "workforce design assistant" with Agent and Advisor modes. Help page states it "doesn't share any information with OpenAI, our AI provider". Screenshot dated Sept 2025 — [Functionly help](https://www.functionly.com/help/designing-scenarios/orgpilot)

**Organimi** (SMB, nonprofit and government org chart)
- Two plans, Basic and Premium, priced by employee count:
  - Vendor page: from $10 and $20 a month (annual billing); undated — [Organimi](https://www.organimi.com/?p=7643)
  - Capterra: $18 and $35 a month — [Capterra](https://www.capterra.com/p/165892/Organimi/pricing/)
  - Softwarefinder (Nov 2024): $20 and $39 — [Softwarefinder](https://softwarefinder.com/hr/organimi)
- Premium adds backup snapshots, matrix charts, API and a success manager — [Capterra](https://www.capterra.com/p/165892/Organimi/pricing/)
- SAML SSO (Okta, Azure AD, Google, JumpCloud, OneLogin) is Premium only. HRIS connectors via "Organimi Connect" (BambooHR, Paycor, Personio, Paylocity, PeopleHR, plus SFTP) are Premium only — [Organimi SSO](https://www.organimi.com/?p=10254); [Organimi FAQ](https://www.organimi.com/questions/)
- Markets to government — [Organimi government](https://www.organimi.com/government/)

**OrgChart Now (OfficeWork Software)** (mid-market auto-generated charts from HRIS/ATS)
- Real-time data from linked HRIS and ATS, branded templates, and separate views for executives, managers and employees — [Software Finder](https://softwarefinder.com/hr/orgchart)
- Pricing conflicts across sources:
  - Core from $1,260 a year per 100 employees charted, 14-day trial — [OneDirectory](https://www.onedirectory.com/blog/best-org-chart-software/)
  - From $105 a month — [Capterra](https://www.capterra.com/p/82369/OrgChart/); [ITQlick](https://www.itqlick.com/orgchart)
  - Premium $99 a month (annual) — [Software Finder](https://softwarefinder.com/hr/orgchart)
  - 100-employee billing minimum — [OrgPlease](https://orgplease.com/blog/org-chart-software-pricing-2026)

**Agentnoon** (AI-native org design and workforce planning; now Dayforce)
- Capabilities: spreadsheet to org chart, drag-and-drop scenarios, headcount and cost forecasting, spans and layers. Entry tier for companies under 2,500 employees; enterprise tier covers restructuring, M&A, offshoring and HRIS integrations — [Capterra](https://www.capterra.com/p/10003093/Agentnoon); [G2](https://www.g2.com/products/agentnoon/reviews)
- Dayforce acquired Agentnoon (announced 7 Oct 2025) and launched Dayforce Strategic Workforce Planning the same day — [IT Brief NZ](https://itbrief.co.nz/story/dayforce-unveils-ai-driven-workforce-planning-with-agentnoon-merge); [Osler](https://www.osler.com/en/about-us/representative-work/agentnoon/); [Barchart](https://www.barchart.com/story/news/35290547/dayforce-launches-strategic-workforce-planning)

**Nakisa Workforce Planning** (enterprise, 5,000+ employees, strong in SAP)
- Quote-based pricing; ITQlick lists "from $5,000 per installation" — [Software Advice](https://www.softwareadvice.com/org-chart/nakisa-hanelly-profile/); [ITQlick](https://www.itqlick.com/category/org-chart)
- Two major releases a year — [Capterra](https://www.capterra.com/p/251733/Nakisa-Organizational-Management/)

**Ingentis org.manager** (German enterprise org charting; strong in SAP/Workday)
- Licensed by number of objects (employees) charted:
  - About $2,000 one-time entry — [ITQlick](https://www.itqlick.com/ingentis-orgmanager)
  - $1,750 one-time — [SourceForge](https://sourceforge.net/software/product/Ingentis-org.manager/)
  - €95 per feature per month — [Capterra](https://www.capterra.com/p/132343/Ingentis-org-manager/)
- No 2025–26 release info found (see Gaps).

**Sift** (org chart plus directory for mid-market and enterprise)
- Flat monthly tiers, paid annually: Org Chart $150, Directory $175, Complete $200, plus $1.50 / $2.00 / $3.25 per additional user — [Sift](https://www.justsift.com/pricing); [G2](https://www.g2.com/products/sift-sift/pricing)
- Teams app: search, org chart and profiles inside Teams. Free trial, no free tier — [GetApp](https://www.getapp.com/hr-employee-management-software/a/sift/)

**Teamflect** (Microsoft Teams-native performance management; org chart is secondary)
- Free for up to 10 users. Essential $7 per user per month (annual; $9 monthly), Professional $11 ($14 monthly), Enterprise custom — [Tability](https://www.tability.io/compare/platform/teamflect); [GetApp](https://www.getapp.com/hr-employee-management-software/a/teamflect/)
- Org chart is synced from the Microsoft 365 / Entra hierarchy (needs the Directory.Read.All permission; manual upload otherwise). An intranet org chart view is on the Professional plan — [Teamflect help](https://help.teamflect.com/en/articles/14019709-admin-guide-understanding-and-using-the-organization-chart-in-teamflect); [Teamflect changelog](https://roadmap.teamflect.com/changelog/new-feature-organizational-chart-view-in-intranet); [Graph permissions](https://help.teamflect.com/en/articles/8899108-understanding-teamflect-s-use-of-microsoft-graph-api-permissions)

**HRIS and suite built-ins**
- **Personio:** org chart under Organization > Org chart, viewable by employee, department or team. Leads cannot be imported — [Personio help](https://support.personio.de/hc/en-us/articles/360017540757-Overview-of-the-Org-chart); [Manage org chart](https://support.personio.de/hc/en-us/articles/29762795544989-Manage-the-Org-chart). No headcount-planning module found.
- **HiBob:** native Workforce Planning module since Oct 2022 — [PR Newswire 2022 (pre-2024, possibly outdated)](https://www.prnewswire.com/news-releases/hibob-introduces-workforce-planning-to-its-hr-platform-bob-301648711.html)
- **Rippling:** Headcount Planning with "AI insights", compensation bands, and auto-approval of hires within plan, with off-plan hires routed to an approval chain — [Rippling](https://www.rippling.com/products/hr/headcount-planning); [Rippling blog (about 2023)](https://www.rippling.com/blog/introducing-rippling-headcount-planning-compensation-bands)
- **Workday:** workforce planning and scenario modeling; reported at about $100 per employee per month (aggregator figure) — [match-vs](https://www.match-vs.com/en/blog/bamboohr-vs-workday)
- **Microsoft 365:**
  - Org Explorer no longer requires a Viva premium license (from May 2025). It is available to all Enterprise and EDU tenants and reads its data from Entra ID manager relationships — [MC939925](https://mc.merill.net/message/MC939925/v/2025-02-14T18-57-48-287Z); [Microsoft Support](https://support.microsoft.com/en-US/People-Skills/org-explorer)
  - New Teams profile-card org chart with report counts; GA March 2026 — [Microsoft roadmap via merill](https://mc.merill.net/message/RM500696)

### Inferences
- Effective price floor for a hosted org chart is about $1.50–$5 per employee per month, or about $1,000–$5,000 a year for small companies. Free charts in Microsoft 365, Personio and HRIS suites compress the low end, so a standalone chart alone is weak to sell. Value has to come from planning, decisions and integration.
- Functionly's per-editor-seat model is the closest commercial analogue to OrgFlow's planner-centric use case. OrgFlow's free, local-first model undercuts it entirely.
- Consolidation is real: Workleap bought Pingboard, Dayforce bought Agentnoon, and ChartHop is on the ADP Marketplace. Standalone vendors are being absorbed into HCM suites, which leaves room for neutral, HRIS-agnostic, self-hostable tools.

### Gaps
- Could not load the BambooHR or Workday org chart feature pages. BambooHR's org chart is widely known to exist, but no 2026 source was retrieved.
- No first-party Lucid pricing page or Lucid AI org chart features were retrieved.
- Sift's feature set beyond pricing and Teams was not verified.
- Orgvue and Nakisa per-employee prices are not public.
- Agentnoon's standalone pricing after the Dayforce deal is unknown.

## 2. Table stakes vs. differentiators, mapped against OrgFlow

### Takeaway
Table stakes, present in most vendors: an HRIS-synced chart (automatic, not CSV), SSO (SAML/OIDC), employee directory and profiles with photos, custom fields, search, exports (PDF/PNG/CSV), view permissions, and a Teams or Slack presence. Planning-tier norms: scenarios, headcount and cost forecasting, and spans and layers. OrgFlow's biggest table-stakes gaps are vendor HRIS connectors (plus SCIM/SAML) and Slack. Its planning depth (positions vs. people, decision workflow, dated timeline) is at or above mid-market. Its AI and MCP capability exists but is agent-side only, not in-UI.

### Cited Findings
- HRIS connectors are standard in lightweight tools: Pingboard ("automated integrations") — [Workleap FAQ](https://help.workleap.com/en/articles/10436716-pingboard-migration-faq); Organimi (BambooHR, Paycor, Personio, Paylocity, PeopleHR, SFTP) — [Organimi FAQ](https://www.organimi.com/questions/); OrgChart Now (HRIS plus ATS) — [Software Finder](https://softwarefinder.com/hr/orgchart); Teamflect (Microsoft 365/Entra) — [Teamflect help](https://help.teamflect.com/en/articles/14019709-admin-guide-understanding-and-using-the-organization-chart-in-teamflect)
- Lack of a live HRIS link is cited as a key weakness of Lucidchart — [OrgChartStudio](https://www.orgchartstudio.com/blog/best-org-chart-software)
- SAML SSO with Okta, Azure AD and Google is offered (Premium tier) — [Organimi](https://www.organimi.com/?p=10254)
- Teams presence: Sift's Teams app — [GetApp](https://www.getapp.com/hr-employee-management-software/a/sift/); Teamflect is Teams-native — [Teamflect](https://teamflect.com/microsoft-teams-integration); ChartHop added Microsoft Teams support in its Aug 2026 update — [ChartHop updates (via search)](https://www.charthop.com/resource/charthop-product-updates-june-2026)
- Slack: Pingboard alerts and summaries — [Pingboard integrations](https://pingboard.com/integrations)
- Scenarios, forecasting and spans/layers are standard in planning tools: Agentnoon — [Capterra](https://www.capterra.com/p/10003093/Agentnoon); ChartHop Impact Dashboard — [docs](https://docs.charthop.com/impact-dashboard); Rippling headcount plans with approvals — [Rippling](https://www.rippling.com/products/hr/headcount-planning)
- Matrix or dotted-line support is now marketed as a feature: ChartHop Matrix Teams (Jul 2025) — [ChartHop](https://www.charthop.com/resources/charthop-product-updates-july-2025); Organimi matrix charts (Premium) — [Capterra](https://www.capterra.com/p/165892/Organimi/pricing/)
- Mobile: ChartHop mobile forms and time off (Jul 2025) — [ChartHop](https://www.charthop.com/resources/charthop-product-updates-july-2025)

### Feature map: competitors vs. OrgFlow (H = have, P = partial, M = missing)

| Feature | Who offers it (examples) | Status | OrgFlow | Notes |
|---|---|---|---|---|
| Interactive chart, search, photos, branding | Everyone | Table stakes | H | Includes a large-chart virtualization edge |
| Dotted-line / matrix reporting | ChartHop, Organimi Premium | Common | H | |
| PDF / print / CSV export | Everyone | Table stakes | H | A3 tiled PDF, CSV; no PNG/PPT noted |
| CSV / Excel import | Everyone | Table stakes | H | Includes reusable mapping profiles |
| Live HRIS sync (BambooHR, Personio, HiBob, Workday, ADP…) | Pingboard, Organimi, OrgChart Now, ChartHop, Agentnoon enterprise | Table stakes (paid tier) | **M** | Largest gap |
| Microsoft 365 / Entra sync | Teamflect, MS Org Explorer, Sift | Common | **M** | OrgFlow has a Teams tab but no Entra hierarchy import |
| SSO (SAML/OIDC) | Organimi Premium, enterprise tools | Table stakes (premium) | P | OIDC bring-your-own only; no SAML noted |
| SCIM provisioning | Enterprise tiers | Expected in enterprise | **M** | |
| Employee directory and profiles | Pingboard, Sift, HRIS | Table stakes | P | People directory with skills; no rich profile or "about me" pages noted |
| Slack integration | Pingboard | Common | **M** | |
| Teams integration | Sift, Teamflect, ChartHop (2026) | Common | H | Tab plus notification bot |
| Permissions / role-scoped views | ChartHop (comp visibility), OrgChart Now (views per role) | Table stakes | H/P | Subtree-scoped editors; no field-level comp visibility noted |
| Scenario planning and compare | ChartHop, Functionly, Orgvue, Agentnoon, Nakisa | Standard in planning tier | H | Plus a decision workflow and audit trail, which is a differentiator |
| Headcount / cost forecast | ChartHop, Rippling, Agentnoon, Dayforce SWP | Standard in planning tier | H | 1–36 months; no FX conversion |
| Spans and layers analytics | Agentnoon, Orgvue | Standard in planning tier | P | Single-person-dependency summaries; no span/layer dashboards |
| Analytics dashboards (diversity, attrition, custom) | ChartHop Data Explorer, Orgvue | Common mid/enterprise | **M** | |
| Compensation planning / bands | ChartHop add-on, Rippling bands | Premium add-on | **M** | Position budgets exist |
| Job architecture / role clustering | Orgvue Henshaw Roles, Workday and HiBob agents | Emerging (AI) | **M** | |
| Skills mapping | HiBob AI Skills Framework, Nakisa | Emerging | P | Declared skills only |
| Headcount approvals | Rippling, ChartHop AI Pro agents | Common | H | Proposal workflow |
| Hiring plan / ATS link | OrgChart Now (ATS), Rippling Recruiting | Common | P | Vacancies and recruiting seats, no ATS |
| Mobile app | ChartHop mobile, HRIS apps | Common | **M** | |
| In-UI AI assistant / natural-language query | Orgvue Henshaw Assistant, Functionly OrgPilot, Nakisa agent | Differentiator, becoming table stakes in 2026 | **M** | |
| MCP server / agent access | ChartHop (2026, read+write), Nakisa (GA Jul 2026), Zapier ChartHop MCP | Emerging differentiator | H | Read plus draft proposals only, a safety posture |
| Public REST API | Organimi Premium, ChartHop | Premium | H | Scoped tokens |
| Seating / desk plans | Rare among org chart vendors | Differentiator | H | |
| Hybrid-work planning (location, vacation, desks) | HRIS suites, not org chart tools | Differentiator vs. pure org chart tools | H | |
| Self-hosted / local-first | Rolebase (MIT), Ingentis (on-prem heritage) | Niche | H | |
| Hosted SaaS | Everyone except open source | Table stakes for buyers | **M** | |

### Inferences
- The two adoption blockers for OrgFlow in a commercial comparison are no automatic data feed (HRIS or Entra) and no SAML/SCIM. Nearly every paid competitor lists HRIS sync as headline functionality.
- OrgFlow's rarer strengths are worth leading with: positions separate from people, a dated timeline, a governed proposal workflow, seating plans, hybrid-work planning and MCP/CLI agent access. Competitors either lack them or charge enterprise prices for them.
- An Entra ID hierarchy import would be cheap leverage. OrgFlow already has a Teams app, and Teamflect and Microsoft both treat Entra as the source of truth.

### Gaps
- No G2 or Capterra comparison-grid data was retrieved (fetch blocked), so the "table stakes" classification is inferred from vendor feature lists, not from a quantified category grid.

## 3. 2025–2026 launches, especially AI

### Takeaway
2025–26 is the "agentic" cycle. Several vendors shipped AI assistants for natural-language queries, AI job-architecture and role clustering, conversational headcount-planning agents, and MCP servers that expose org data to Claude and ChatGPT. MCP support became a shipping feature in 2026: ChartHop added read+write MCP and Nakisa made MCP generally available across its suite. HCM suites (Workday, HiBob, Dayforce) are absorbing org design through agents and acquisitions.

### Cited Findings
- **ChartHop**
  - AI Pro (24 Mar 2026): a premium suite of autonomous agents for multi-step actions, e.g. initiating headcount approvals and syncing multi-entity structures — [BusinessWire](https://www.businesswire.com/news/home/20260324185252/en/ChartHop-Launches-AI-Pro)
  - June 2026 update: MCP with read and write access, bringing live org data into Claude and ChatGPT. Approved workflows can update ChartHop; access is governed by existing permissions, with per-employee credentials — [ChartHop June 2026 update](https://www.charthop.com/resource/charthop-product-updates-june-2026)
  - Aug 2026: Microsoft Teams support and AI survey tools. Sept 2026: Data Sheet and goals — same source (search summary)
  - On ADP Marketplace since 3 Mar 2026 — [ChartHop](https://www.charthop.com/resource/charthop-ai-adp-marketplace)
  - Third-party ChartHop MCP via Zapier — [Zapier](https://zapier.com/mcp/charthop)
- **Orgvue** Henshaw AI (3 Dec 2025, early access): Henshaw Roles (AI clusters positions into roles, role clusters and job families) and Henshaw Assistant (natural-language data queries). Uses dedicated language models to protect customer data; more capabilities promised during 2026 — [Orgvue press release](https://www.orgvue.com/news/orgvue-unveils-henshaw-suite-of-ai-platform-capabilities/); [Reworked](https://www.reworked.co/talent-management/orgvue-launches-henshaw-ai-suite-to-automate-workforce-planning/); [IT Brief](https://itbrief.co.uk/story/orgvue-unveils-henshaw-ai-to-transform-workforce-planning)
- **Nakisa**
  - 2025.R1: AI-powered org design, Operational Workforce Planning and a conversational headcount-planning agent — [Nakisa blog](https://nakisa.com/blog/nakisa-workforce-planning-org-design-org-chart-software-2025-r1-new-features/)
  - MCP supported across the full suite (23 Jul 2026); Databricks integration (28 Jul 2026); Gartner Market Guide representative vendor (Aug 2026) — [Nakisa news](https://nakisa.com/news/)
  - Nakisa Decision Intelligence with AI agents — [Nakisa](https://nakisa.com/blog/introducing-nakisa-decision-intelligence-for-org-design-and-workforce-planning/)
- **Functionly** OrgPilot: AI design assistant with Agent and Advisor modes (around Sept 2025) — [Functionly help](https://www.functionly.com/help/designing-scenarios/orgpilot)
- **Dayforce** acquired Agentnoon and launched Strategic Workforce Planning (Oct 2025) — [IT Brief NZ](https://itbrief.co.nz/story/dayforce-unveils-ai-driven-workforce-planning-with-agentnoon-merge)
- **HiBob**
  - AI Skills Framework and assessment guide (Jul 2026) — [Manila Times / GlobeNewswire](https://www.manilatimes.net/2026/07/23/tmt-newswire/globenewswire/hibob-launches-ai-skills-framework-and-a-new-ai-skills-assessment-guide-to-help-organizations-build-workforce-readiness-for-the-ai-era/2390224)
  - "Galileo inside Bob" agents with the Josh Bersin Company (16 Sept 2026). First agents cover job architecture, compensation and performance; available Q3 2026, full GA 2027 — [GlobeNewswire](https://www.globenewswire.com/news-release/2026/09/16/3363105/0/en/hibob-and-the-josh-bersin-company-launch-galileo-powered-workforce-intelligence-in-bob.html); [HiBob](https://www.hibob.com/news/hibob-and-the-josh-bersin-company-launch-galileopowered-workforce-intelligence-in-bob/)
- **Workday** Illuminate agents (announced 2025, availability slated for 2026): Job Architecture Agent, Performance Agent, Employee Sentiment Agent; existing Planning Agent; Flex Credits pricing — [Workday newsroom](https://newsroom.workday.com/2025-05-19-Workday-Unveils-Next-Generation-of-Illuminate-Agents-to-Transform-HR-and-Finance-Operations); [TechTarget](https://www.techtarget.com/searchhrsoftware/news/366625056/Workday-adds-seven-agents-to-Illuminate-platform); [CPA Practice Advisor](https://www.cpapracticeadvisor.com/2025/09/22/workday-rolls-out-group-of-new-ai-agents-debuts-flex-credits/169401/)
- **Microsoft**
  - Viva Insights is bundled into the M365 Copilot license (2025) — [Office365ITPros](https://office365itpros.com/2025/05/19/microsoft-365-copilot-license-sp/)
  - Copilot in Viva Insights gives org insights — [Microsoft Learn](https://learn.microsoft.com/en-us/viva/insights/org-team-insights/org-insights-copilot)
  - Org Explorer unbundled from Viva (May 2025) — [MC939925](https://mc.merill.net/message/MC939925/v/2025-02-14T18-57-48-287Z)

### Inferences
- Natural-language query over org data and MCP access are becoming expected in 2026–27. OrgFlow already has MCP, CLI and agent skills, which puts it ahead of most SMB tools (Organimi, Pingboard, Sift and Lucid showed no comparable announcements). OrgFlow lacks an in-UI assistant.
- ChartHop's MCP is read+write, governed by per-user permissions. OrgFlow's "read plus draft proposals, never apply" is a defensible, more conservative position. Pitch it as governance-first AI.
- AI job architecture (Orgvue, Workday, HiBob) and skills frameworks (HiBob) are the next frontier. OrgFlow's declared-skills data is a foundation, but it has no role clustering.
- Data-privacy framing is used even by enterprise vendors: Orgvue's "dedicated language models" and Functionly's "doesn't share with OpenAI". That supports a privacy-first or local-model AI angle.

### Gaps
- No 2025–26 release notes were found for Organimi, Sift, OrgChart Now, Pingboard/Workleap, Lucid, Ingentis or BambooHR.
- No first-party confirmation of Nakisa 2026 release contents beyond news headlines.

## 4. Features gated behind premium tiers

### Takeaway
The consistent premium gates are SSO, HRIS connectors, API access, matrix charts and backups (lightweight tools), plus planning, compensation and AI modules sold as add-ons (ChartHop). AI agent suites are quote-only. Editing seats are the gate in Functionly. Advanced org chart views are Pro-tier in Teamflect.

### Cited Findings
- Organimi Premium-only: SSO, Organimi Connect HRIS integrations, API, matrix charts, backup snapshots, dedicated success manager — [Organimi SSO](https://www.organimi.com/?p=10254); [Organimi FAQ](https://www.organimi.com/questions/); [Capterra](https://www.capterra.com/p/165892/Organimi/pricing/)
- ChartHop: Core ($5) plus paid add-ons for HRIS, Headcount Planning, Compensation and Performance ($4 each) and Engagement and Goals ($3). AI Pro is custom-priced — [PricingSaaS](https://pricingsaas.com/companies/charthop); [CostBench](https://www.costbench.com/software/workforce-analytics/charthop/)
- ChartHop gates cost visibility in scenarios by the viewer's compensation permission — [ChartHop docs](https://docs.charthop.com/impact-dashboard)
- Functionly: unlimited people; paid by editor seat; Enterprise for 20+ seats — [Functionly](https://www.functionly.com/org-chart-software-0)
- Teamflect: intranet org chart view on the Professional plan — [Teamflect changelog](https://roadmap.teamflect.com/changelog/new-feature-organizational-chart-view-in-intranet)
- Sift: Directory and Complete tiers cost more than Org Chart alone — [Sift](https://www.justsift.com/pricing)
- Pingboard: Standard vs. Pro vs. Enterprise (above 250 employees) — [xpay](https://www.xpay.sh/saas-pricing/pingboard/); [OrgPlease](https://orgplease.com/blog/org-chart-software-pricing-2026)
- Rippling sells compensation planning as an add-on module (aggregator claim) — [Calamari](https://www.calamari.io/blog/bamboohr-vs-hibob-vs-rippling)
- Workday sells AI agents via consumption-based Flex Credits — [CPA Practice Advisor](https://www.cpapracticeadvisor.com/2025/09/22/workday-rolls-out-group-of-new-ai-agents-debuts-flex-credits/169401/)
- Microsoft: advanced Viva Insights features need at least 50 Copilot or Viva licenses — [Microsoft Learn](https://learn.microsoft.com/en-us/viva/insights/org-team-insights/copilot-dashboard)

### Inferences
- If OrgFlow ever monetizes (hosted or supported edition), the market-validated premium gates are SSO/SCIM, HRIS connectors, compensation visibility and planning, AI assistant and agents, and audit/backup. OrgFlow already gives away several of these (API, matrix, scenarios, audit) free and self-hosted.

### Gaps
- Exact feature-by-tier matrices for Pingboard, Sift and OrgChart Now were not retrievable.

## 5. Open-source, self-hosted and local-first positioning, and demand for privacy-first options

### Takeaway
The open-source space is mostly charting libraries (d3-org-chart, MIT) and general diagram tools (draw.io, Apache-2.0), plus one notable full app, Rolebase (MIT, self-hostable, role/governance-oriented). The best-known "OrgChart JS" is proprietary. No open-source competitor found offers OrgFlow's combination of positions, scenarios with approvals, forecast, workplace planning and MCP. Evidence of demand for self-hosted org charting specifically is thin. It is indirect, via EU GDPR, works-council co-determination, data-residency requirements for HR software, and vendors' own privacy-oriented AI messaging.

### Cited Findings
- d3-org-chart: MIT, with React/Vue/Angular wrappers. OrgChart JS (BALKAN) is proprietary, with perpetual licenses of $399–$4,999 — [BALKAN comparison](https://blog.balkan.app/d3-org-chart) (vendor of OrgChart JS, so biased); [Rolebase](https://rolebase.io/en/blog/open-source-org-chart-tools)
- Rolebase: MIT, self-hostable, positioned for "organizations that prioritize data sovereignty", more than 1,149 commits — [Rolebase blog](https://rolebase.io/en/blog/open-source-org-chart-tools) (self-interested source)
- draw.io (Apache-2.0) is called the "safest pick" for a quick org chart in a 2026 roundup — [Rolebase](https://rolebase.io/en/blog/open-source-org-chart-tools)
- Open-source org chart roundups exist, showing search interest — [GoodFirms](https://www.goodfirms.co/org-chart-software/blog/best-free-open-source-org-chart-software); [SoftwareSuggest](https://www.softwaresuggest.com/org-chart-software/free-open-source-softwares); [Peerdom](https://peerdom.com/blog/best-org-chart-software)
- European HR software selection involves "strict GDPR, AVV/DPA demands, EU data residency and works council co-determination", whereas in the US/UK formal approval is rarely needed — [Sprad](https://sprad.io/blog/best-performance-management-software-for-europe-7-tools-that-respect-gdpr-works-councils-and-local-hr-practice) (vendor blog)
- EU hosting is "often a dealbreaker before the software is even evaluated on features" for GDPR, public-sector or data-sovereignty buyers — [okrstool](https://www.okrstool.com/blog/eu-okr-software) (vendor claim, adjacent category)
- Self-hosting moves responsibility for security, patching and backups onto the operator — [Lunacal](https://lunacal.ai/blogs/gdpr-compliant-scheduling-software-eu)
- Organimi targets government organizations — [Organimi](https://www.organimi.com/government/). The UK G-Cloud listing for Orgvue shows public-sector procurement of org design tools — [Digital Marketplace](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/426303922263495)
- Vendors market AI privacy: Orgvue "dedicated language models" — [IT Brief](https://itbrief.co.uk/story/orgvue-unveils-henshaw-ai-to-transform-workforce-planning); Functionly "doesn't share any information with OpenAI" — [Functionly](https://www.functionly.com/help/designing-scenarios/orgpilot)
- Pingboard price increases after the acquisition pushed some customers to look for alternatives (anecdotal, competitor sources) — [Steegle.One](https://one.steegle.com/blog/pingboard-alternative-workleap-price-increase); [Pingboard CEO post](https://pingboard.com/blog/an-update-from-our-ceo)

### Inferences
- OrgFlow occupies a near-empty quadrant: a full-featured planning and decision tool that is also local-first and self-hostable. The closest open alternative (Rolebase) is governance and role oriented, not FTE, budget and scenario oriented.
- Concrete demand signals are indirect: works councils, EU residency, public sector, AI-privacy messaging and price-hike churn. The pitch should combine privacy with "no per-employee bill" and "AI agents without sending HR data to a SaaS".
- Without HRIS or Entra connectors, self-hosted buyers must still feed data manually, which undercuts the privacy argument for larger organizations.

### Gaps
- No quantitative demand data was found (survey percentages, GitHub star counts for d3-org-chart or Rolebase, or download numbers).
- No analyst coverage (Josh Bersin, HR Dive, HR Executive) specifically on self-hosted org design tools was found.
- Ingentis's on-premise offering was not verified for 2026.
