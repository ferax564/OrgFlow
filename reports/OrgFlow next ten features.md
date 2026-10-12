# Feed the chart, govern the money, coordinate the office

OrgFlow's next ten features should fix one structural weakness, meet two compliance deadlines and extend its lead on governed AI. The weakness is data that goes stale. **"The chart is out of date" is the category's dominant complaint**, and every paid competitor sells automatic HRIS or directory sync. OrgFlow has only CSV import, so the top-ranked feature is directory and HRIS sync (Microsoft Entra ID first) that lands as a governed Draft rather than overwriting Current. The two deadlines come from the **EU Pay Transparency Directive** and from the shift in hybrid work toward measuring attendance. The Directive's first gender pay gap reports are due on **7 June 2027** for employers with 150 or more workers. It needs job architecture and pay bands on positions, which is exactly where OrgFlow keeps its data. On the workplace side, **89% of US employers now require three or more office days but attendance averages 2.9 days against a 3.2-day target**, so demand is moving from booking desks to planning and proving attendance against policy. The rest of the list covers what mid-market planners and workplace buyers treat as table stakes: headcount requests against budgets with plan-vs-actual, leave balances and public holidays, Outlook and Google work-location sync, attendance policies that a works council can accept, SCIM provisioning, span-and-layers analytics, approvals inside chat, and workplace-aware MCP tools. OrgFlow's MCP server only drafts proposals and never applies them. That design now matches where Orgvue and Workday Adaptive Planning landed in October 2026, so it is a differentiator to protect, not a gap. One caveat applies throughout: most sources were read through search-result summaries rather than full pages, prices come from aggregators that often disagree, and no buyer survey ranks these features directly. The ranking is a reasoned judgment on directional evidence.

## Stale charts, not missing charts, are what buyers punish

The org-chart market has split into free charts bundled with suites, cheap flat-rate chart tools, and premium planning platforms that sync live with the HRIS. The free tier keeps getting stronger. Microsoft Org Explorer no longer needs a Viva license and reads Entra ID manager relationships for every Enterprise tenant ([MC939925](https://mc.merill.net/message/MC939925/v/2025-02-14T18-57-48-287Z)). A Teams profile-card org chart reached general availability in March 2026 ([Microsoft roadmap](https://mc.merill.net/message/RM500696)). A standalone chart therefore has little value by itself. Buyers pay for currency, planning and governance.

On currency, the complaint is consistent across sources. Charts kept outside the HRIS need constant re-imports. Lucidchart's lack of a live people-data link is described as its key weakness ([OrgChartStudio](https://www.orgchartstudio.com/blog/best-org-chart-software)), and buyers are advised to confirm HRIS support "to avoid duplicate work" ([People Managing People](https://peoplemanagingpeople.com/tools/best-org-chart-tools/)). Vendors that sync sell exactly that. OrgChart claims more than 50 HR-system integrations with real-time sync ([theorgchart.com](https://theorgchart.com/solutions/automated-charts/)). Organimi sells BambooHR, Personio, Paylocity and SFTP connectors in its Premium tier ([Organimi FAQ](https://www.organimi.com/questions/)). Teamflect builds its chart from the Entra hierarchy ([Teamflect help](https://help.teamflect.com/en/articles/14019709-admin-guide-understanding-and-using-the-organization-chart-in-teamflect)). Sync is not cheap to buy in. Unified HRIS APIs cost about **$65 per connected customer per month** ([Truto](https://truto.one/blog/what-are-the-best-alternatives-to-finch-for-employment-data-in-2026/)), with typical Merge contracts of $50K–$120K a year ([Vendr](https://www.vendr.com/marketplace/merge-api)). That is affordable for a hosted SaaS charging per employee and unaffordable for a free, self-hosted tool, so OrgFlow needs native connectors to a few open APIs and a pluggable interface for customers who bring their own aggregator.

Three other forces shape the list. The first is regulation. The EU Pay Transparency Directive's transposition deadline of 7 June 2026 has passed without an EU-level delay, and the first reports for employers with 250+ and 150–249 workers are due by 7 June 2027 ([Legal500](https://www.legal500.com/developments/thought-leadership/the-eu-pay-transparency-directive-how-companies-can-prepare-for-new-rules-on-equal-pay/); [Lewis Silkin](https://www.lewissilkin.com/insights/2026/07/01/eu-pay-transparency-directive-2026-employer-compliance)). In the US, Virginia now requires pay ranges in internal postings too, from 1 July 2026, and Connecticut follows from 1 October 2026 ([Cooley](https://www.cooley.com/news/insight/2026/2026-07-06-show-me-the-money-or-the-wage-range-new-state-pay-transparency-laws)).

The second force is agentic AI with governance attached. ChartHop shipped read-and-write MCP in June 2026 ([ChartHop](https://www.charthop.com/resource/charthop-product-updates-june-2026)) and Nakisa shipped suite-wide MCP in July ([Nakisa](https://nakisa.com/news/)). Orgvue's October 2026 WebMCP lets agents only *propose* workforce changes ([HR Tech Edge](https://hrtechedge.com/hr/orgvue-brings-governed-ai-agents-into-workforce-design/)), and Workday Adaptive Planning's MCP server goes to production on 16 October 2026 ([Workday docs](https://doc.workday.com/adaptive-planning/en-us/what-s-new/releases/2026r2-release-notes/2026r2-planning-for-hcm-and-financials/adaptive-planning-mcp-server.html)). Robin launched a Claude connector for workplace and space planning on 6 October 2026 ([PR Newswire](https://www.prnewswire.com/news-releases/robin-reinvents-space-planning-for-the-workplace-claude-first-302899566.html)).

The third force is hybrid work turning into policy enforcement. CBRE finds 89% of employers require three or more days, up from 78%, while actual attendance lags target ([CBRE](https://www.cbre.com/insights/reports/2026-americas-office-occupier-sentiment-survey)). Office visits remain **21–32% below 2019** in Placer.ai's 2026 index ([Placer.ai May](https://www.placer.ai/anchor/articles/may-2026-placer-ai-office-index-gains-hide-in-plain-sight); [Placer.ai Jul](https://www.placer.ai/anchor/articles/july-2026-placer-ai-office-index-steady-in-the-summer-heat)). At the same time, Microsoft made Places coordination available to most M365 users on 1 April 2026 and moved desk features to per-space licensing at about $2 per desk per month ([MC1235124](https://mc.merill.net/message/MC1235124); [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/places/what-is-places/buy-set-up-teams-shared-space-licenses-desks)). That makes a plain "who's in" calendar a commodity. Third-party workplace tools now have to sync with Outlook work location and win on what Places lacks: leave, approvals, org-aware coordination and data control.

## How the ten were ranked, and where the evidence is thin

Each candidate was scored on four things. The first was strength and breadth of market evidence: how many competitors ship it, whether it is gated as premium, and whether a regulation or survey drives it. The second was fit with OrgFlow's architecture. That architecture has pure rules in shared `js/*-core.js` modules, a server that enforces every permission, positions kept separate from people, a Draft → Applied decision workflow, scoped API tokens, and an MCP server that only drafts. The third was whether the feature strengthens or erodes OrgFlow's differentiators. The fourth was effort. Effort sizes are rough engineering judgments, not estimates from the notes: **S** is about three engineer-weeks or less, **M** is one to two engineer-months, and **L** is a quarter or more, including tests against the in-memory host.

The evidence base has real limits, and the ranking should be read with them in mind. All four research streams report that direct page fetches were blocked for most vendor, analyst and legal domains. That includes charthop.com, gartner.com, eur-lex.europa.eu, trusaic.com and most desk-booking vendors, so many findings rest on search-result summaries. Prices conflict across aggregators. ChartHop, for example, is listed at $5 PEPM, $8 PEPM or $2 per user, and its $9K minimum comes from a single source ([CostBench](https://costbench.com/software/workforce-analytics/charthop/hidden-costs/)). No G2 category grid, Gartner Hype Cycle or buyer survey ranks features for 200–5,000-employee companies. The mid-market priority order in the workforce-planning notes is inferred from vendor positioning, much of it from vendors such as Abacum ranking their own category ([Abacum](https://www.abacum.ai/blog/best-headcount-workforce-planning-software)). There was no citable 2025–2026 evidence on mobile, localization or field-level privacy demand. Reddit and Hacker News threads could not be read. Four individual claims that bear on the ranking are also unverified:

| Claim | What is missing |
| --- | --- |
| Microsoft Graph has an endpoint to read and write a user's work-location plan | Not confirmed; only the Places resource API was confirmed |
| Buyers treat SCIM or SAML as a hard requirement for org-chart tools | No direct evidence |
| Competitors' MCP coverage | Not systematically checked |
| How German works councils treat desk sharing | Case law is unsettled ([Pult](https://pult.com/blog/work-agreement-desk-sharing)) |

Where a ranked feature depends on one of these, its entry says so.

## Strong candidates that missed the cut

**Fully loaded cost, FX conversion and attrition or backfill assumptions** in the 1–36 month forecast came closest. Buyer guides treat headcount cost tied to budget as core, and FP&A tools such as Pigment, Abacum and Causal model burden rates ([CFO Shortlist](https://www.cfoshortlist.com/reports/abacum-vs-pigment)). OrgFlow's forecast keeps currencies separate. Two things kept it out. No primary vendor documentation on how competitors model these was retrieved. It also works best as a follow-on to headcount requests (rank 3), whose budget envelopes need loaded cost to be meaningful. Plan it as that feature's second phase.

**Desk check-in with auto-release** is table stakes in Microsoft Places itself ([Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/places/enable-auto-release)). It is cheap, but two things argue against it. OrgFlow's desk-sharing model already frees desks from declared plans rather than from no-shows. And check-in data is exactly the per-person traceable signal that triggers German co-determination under §87(1) No. 6 BetrVG ([Pult](https://www.pult.com/blog/desk-sharing-work-council)). Ship it later, as an opt-in, once rank 6 gives administrators privacy controls.

**Room booking** is near-universal among desk vendors (Robin, Envoy Premium, Skedda, Joan, YAROOMS) but large to build. Microsoft 365 and Exchange already own rooms in most of OrgFlow's Teams-centric customers.

**An in-app AI assistant** is shipping at Orgvue (Henshaw Assistant), Functionly (OrgPilot) and ChartHop (AI Pro) ([Orgvue](https://www.orgvue.com/news/orgvue-unveils-henshaw-suite-of-ai-platform-capabilities/); [Functionly](https://www.functionly.com/help/designing-scenarios/orgpilot)). The frontier is moving toward bring-your-own-agent, as in Orgvue's WebMCP and Robin's Claude connector. An embedded model would also force OrgFlow to pick a provider and send HR data to it, which undercuts the local-first pitch. Deepening MCP (rank 10) gets most of the value.

**External visitors and parking** are sold almost everywhere as separately priced add-ons ([instacheckin](https://instacheckin.io/blog/envoy-pricing/); [Gable](https://www.gable.to/pricing)), which marks them as secondary.

**Skills taxonomy and gap analysis** is an enterprise play that depends on inferred skills (TechWolf) and labor-market taxonomies (Lightcast) ([Third Bracket](https://blog.thirdbracket.in/top-10-techwolf-ai-alternatives-competitors-in-2026/)), with multi-month deployments.

**An "AI agent" worker type for positions**, often called digital labor, is cheap and on-trend in Deloitte and Bersin framing ([Deloitte Insights](https://www.deloitte.com/us/en/insights/topics/talent/future-of-workforce-planning/reinventing-workforce-planning.html)). No shipped competitor feature was found, so it is a good S-sized experiment, not a top-ten bet.

**ATS integration** is folded into rank 3 as an outbound hook.

**A WCAG 2.1/2.2 AA conformance statement with an accessible outline view of the chart** is a cheap procurement unblocker for public-sector and large French, Italian and Spanish buyers ([Karl Groves](https://karlgroves.com/the-european-accessibility-act-and-b2b-software-what-internal-platforms-must-comply-with/)). It is worth doing alongside the roadmap, but it is compliance hygiene, not a market-pull feature.

**A mobile app, German localization and a hosted SaaS edition** lacked citable demand evidence in this research. SaaS is a business-model decision rather than a feature.

## Differentiators the roadmap must not erode

OrgFlow sits in what the competitor research calls a near-empty quadrant: a full planning and decision tool that is also local-first, free and self-hostable. The nearest open-source alternative, Rolebase, is governance-oriented rather than FTE-, budget- and scenario-oriented ([Rolebase](https://rolebase.io/en/blog/open-source-org-chart-tools)). Five strengths need guarding as the features above land.

The first is the **separation of positions from people with a dated timeline**. Sync, pay bands and headcount requests should all attach to positions, so that a vacancy keeps its band and budget when its holder leaves.

The second is the **governed proposal workflow**. Here the market came to OrgFlow. ChartHop's MCP writes directly under per-user permissions, while Orgvue and Workday chose agent proposals with human approval. Buyers list real-time audit trails (52%) and AI governance tools (43%) as top wants ([TopExecRecruiting citing 451 Research](https://www.topexecrecruiting.com/news-posts/ai-agents-for-hr)), and governance is builders' top MCP pain point ([Theory Ventures](https://theoryvc.com/blog-posts/ai-in-practice-survey-2026)). No new feature, including HRIS sync, should get a side door into Current that bypasses the Draft → Approved → Applied path. Proposal-only AI also keeps OrgFlow clear of the EU AI Act's Annex III employment obligations, now postponed to 2 December 2027 but not removed ([Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/)).

The third is **org chart and hybrid workplace in one data model**. Desk tools rely on "favorite colleagues" or a bolted-on HRIS feed to coordinate teams. OrgFlow knows managers, dotted lines, teams, seating and the hiring plan natively.

The fourth is **data control**: self-hosting, records with explicit retention periods, scheduling-only members who never see org data, and no per-employee bill. This answers EU buyers for whom data residency and works-council approval come before feature evaluation ([Sprad](https://sprad.io/blog/best-performance-management-software-for-europe-7-tools-that-respect-gdpr-works-councils-and-local-hr-practice)). It also answers customers leaving after price rises, such as Pingboard's after the Workleap acquisition ([Pingboard CEO](https://pingboard.com/blog/an-update-from-our-ceo)).

The fifth is **large-chart performance**, which can be pressed in marketing against reports that ChartHop becomes "buggy and clunky" on very large datasets ([OrgChart Studio](https://www.orgchartstudio.com/blog/best-org-chart-software)).

## Conclusion

The research changes what OrgFlow should think it is competing on. It does not need to win the chart: Microsoft and the HRIS suites give charts away. It needs to be the **governed system of record for organizational decisions**: fed automatically, holding the position-level data that pay-transparency law now requires, and open to AI agents without letting them act unsupervised. Two features carry outsized strategic weight. Sync converts OrgFlow from a planning sandbox into a trusted source. Pay architecture with field-level visibility gives a hard, dated reason to buy before June 2027.

On the workplace side, Microsoft's April 2026 licensing change is a threat for "who's in" calendars and an opening for anything org-aware, leave-aware or works-council-safe. That favors integrating with Outlook over competing with it. The common thread is that each top feature routes new data through the machinery OrgFlow already has: Drafts, server-enforced scopes, records and retention. That is why the list is buildable in a year by a small team, and why it widens rather than dilutes the product's moat.

## Ranked: the next ten features OrgFlow should build

| Rank | Feature | Area | Effort |
| --- | --- | --- | --- |
| 1 | Directory and HRIS sync into governed Drafts (Entra ID first) | Org data | L |
| 2 | Job architecture, pay bands and field-level pay visibility for pay transparency | Org design and compliance | L |
| 3 | Headcount requests against budget envelopes, with plan-vs-actual | Workforce planning | L |
| 4 | Leave balances, accrual, country public holidays and max-absent rules | Workplace | L |
| 5 | Two-way Outlook/Places and Google Calendar work-location sync | Workplace | M |
| 6 | Attendance policies, team anchor days and works-council-safe reporting | Workplace | M |
| 7 | SCIM provisioning, then SAML SSO, for the shared host | Enterprise | M |
| 8 | Span-of-control and layers analytics with delayering scenarios | Org design | S |
| 9 | Approvals and commands in Teams chat, then a Slack app | Workplace and integrations | M |
| 10 | Workplace and seat-demand tools in MCP and the CLI | AI and agents | M |

### 1. Directory and HRIS sync into governed Drafts, Microsoft Entra ID first

**Market evidence.** Staleness is the most consistent complaint in the category. Sync is a headline feature in nearly every paid org-chart product and a premium gate in lightweight ones ([GoProfiles](https://www.goprofiles.io/blog/best-org-chart-software-2026/); [Organimi FAQ](https://www.organimi.com/questions/)). Mid-market planning buyers expect HRIS sync to give fast time-to-value, and consolidation into HCM suites means a standalone tool that does not integrate gets displaced ([HiBob/Mosaic via UNLEASH](https://www.unleash.ai/hr-technology/news/hibob-acquires-mosaic-in-game-changing-move-to-bridge-hr-and-finance-gap-for-mid-sized-businesses)). Entra is the natural first source. Many Microsoft customers already pay $6–$9 per user per month for Entra P1/P2 ([SSOJet](https://ssojet.com/blog/top-10-enterprise-sso-providers-2026)), and Microsoft and Teamflect both treat Entra manager attributes as the source of truth for reporting lines.

**Competitors with it.** ChartHop (ADP and others), Pingboard, Organimi Premium (BambooHR, Paycor, Personio, Paylocity, PeopleHR, SFTP), OrgChart Now (HRIS and ATS), OrgChart (50+ HRIS), Teamflect and Microsoft Org Explorer (Entra), and Pigment (200+ connectors).

**In OrgFlow.** A connector module on the shared host runs on the existing hourly job and pulls Entra users and `manager` via Microsoft Graph. Google Workspace Directory, BambooHR, Personio and HiBob follow. A pluggable interface lets an enterprise supply its own Merge, Finch or Kombo key. Each run produces a **"Sync from Entra" Draft proposal** with field-level merge against Current. Customers can apply allowlisted low-risk fields (email, photo, title, location) automatically. Structural changes route through review, so the audit trail stays intact. People match on the existing external ID. Reporting lines are inferred between the positions the synced people hold. Unmatched managers or people without seats are flagged rather than given new positions, which preserves the separation of positions from people. Field mapping reuses the CSV source-mapping profiles. Browser-only users get the same thing through `orgflow sync --dry-run` from the CLI, producing a Draft or a CSV. Sync also supplies the "actuals" that ranks 3 and 4 need.

**Effort: L.** The framework plus Entra is M. Each further HRIS is about S.

**Why first.** It addresses the top complaint, removes the largest adoption blocker in every competitive comparison, makes the self-hosted privacy pitch credible for larger organizations that cannot keep feeding CSVs, and is a prerequisite for plan-vs-actual. Evidence is broad, though the market-share data behind the choice of connector order is thin: only Workday's roughly 9.8% global HCM share surfaced ([AirMason](https://www.airmason.com/blog/workday-vs-competitors-mid-market-hr/)).

### 2. Job architecture, pay bands and field-level pay visibility for pay transparency

**Market evidence.** The EU Directive requires pay structures that assess "work of equal value" on gender-neutral criteria (Art. 4), pay ranges for applicants before interview (Art. 5), accessible progression criteria (Art. 6), and a joint pay assessment when a category's gap reaches 5% unremedied (Art. 10) ([Directive (EU) 2023/970](https://eur-lex.europa.eu/eli/dir/2023/970/oj/eng)). It also requires reports on gaps within each category of workers, the first due 7 June 2027 for employers with 150 or more workers ([Legal500](https://www.legal500.com/developments/thought-leadership/the-eu-pay-transparency-directive-how-companies-can-prepare-for-new-rules-on-equal-pay/)). Transposition is patchy but moving, with Italy, Slovakia, Lithuania, Malta and Greece among the first ([Assessio](https://assessio.com/articles/pay-transparency-directive-country-tracker/)). The US adds ranges in internal postings (Virginia, Connecticut) and more than 300 class actions in Washington since June 2024 ([Cooley](https://www.cooley.com/news/insight/2026/2026-07-06-show-me-the-money-or-the-wage-range-new-state-pay-transparency-laws); [Clockspot](https://www.clockspot.com/research/pay-transparency-laws-by-state)). Job architecture is also where 2026 AI investment is going: Orgvue Henshaw Roles, the Workday Job Architecture Agent, and HiBob's Galileo agents for job architecture and compensation ([Orgvue](https://www.orgvue.com/news/orgvue-unveils-henshaw-suite-of-ai-platform-capabilities/); [GlobeNewswire](https://www.globenewswire.com/news-release/2026/09/16/3363105/0/en/hibob-and-the-josh-bersin-company-launch-galileo-powered-workforce-intelligence-in-bob.html)).

**Competitors with it.** ChartHop Compensation add-on (at $4 PEPM), with scenario cost gated by the viewer's compensation permission ([ChartHop docs](https://docs.charthop.com/impact-dashboard)); Rippling compensation bands ([Rippling](https://www.rippling.com/products/hr/headcount-planning)); Orgvue, Workday and HiBob for job architecture.

**In OrgFlow.** Positions gain job family, level or grade, and a pay band (min, mid, max, currency). A family-by-level "category of workers" carries a recorded set of evaluation criteria. A vacancy cannot be marked as published without a range, which covers the US posting laws including internal postings. Pay must be protected on the host. A new `compensation` permission on members and a matching token scope are enforced in `server/lib`. Subtree editors, scheduling-only employees, MCP and exports without the scope receive redacted fields. Forecast cost respects the same rule, as ChartHop does. Per-person actual pay and gender are imported only on the host. They feed a pay-gap-by-category report with the 5% flag and a reporting export. In local-first mode, `share-export` gains a "strip pay fields" option so a chart can be shared safely.

**Effort: L.**

**Why second.** It is the only feature with a hard external deadline, and it maps exactly onto OrgFlow's position-centric model, which person-centric chart tools cannot match cheaply. The regulatory evidence is strong. Demand evidence for field-level privacy is thin, since none was found in 2025–2026 sources, but the Directive makes it a precondition rather than a request.

### 3. Headcount requests against budget envelopes, with plan-vs-actual

**Market evidence.** Buyer guides list planned-versus-actual headcount and cost, with new hires automatically matched to planned roles, as core. They also list approvals that show the plan before and after a change, with HR owning people data, budget owners requesting within limits, and finance approving ([Abacum](https://www.abacum.ai/blog/best-headcount-workforce-planning-software)). Rippling auto-approves hires within plan and routes off-plan hires to an approval chain ([Rippling](https://www.rippling.com/products/hr/headcount-planning)). Ashby tracks openings against headcount plans, and TeamOhana adds approvals to "stop unapproved spend" ([Ashby](https://www.ashbyhq.com/compare/ashby-vs-greenhouse); [TeamOhana](https://www.teamohana.com/partners/ashby)). The mid-market sits below Pigment, which is considered out of reach under 500 employees ([CFO Shortlist](https://www.cfoshortlist.com/reports/abacum-vs-pigment)).

**Competitors with it.** Rippling, Abacum, Pigment, ChartHop (Finance view and AI Pro headcount approvals), Ashby and TeamOhana, and HiBob through Bob Finance.

**In OrgFlow.** Each group gets an FTE and cost envelope per period. A subtree-scoped editor raises a **headcount request** for a new or backfill position. A request within the envelope can be auto-approved by policy. One outside it becomes a Draft proposal routed to finance or an admin, reusing the existing decision workflow and audit log. Approved requests create recruiting seats. An outbound webhook, with Ashby or Greenhouse first, opens the requisition. Plan-vs-actual compares the Applied plan with actuals snapshots from sync (rank 1) or a scheduled CSV, and matches hires to recruiting seats by position ID. Fully loaded cost and FX are the natural second phase.

**Effort: L.**

**Why third.** It turns OrgFlow from an org-design tool into a headcount-planning tool and reuses its strongest machinery. It ranks below sync because plan-vs-actual needs actuals, and below pay architecture because it has no deadline. The evidence is mostly vendor-authored and comes from search summaries.

### 4. Leave balances, accrual, country public holidays and max-absent rules

**Market evidence.** Leave tools set the minimum feature set at a low price. Timetastic's base tier includes public holidays for more than 250 countries, max-absent rules and mobile apps, with accrual in Pro at about £2 per user ([GetApp](https://www.getapp.com/communication-software/a/timetastic/); [Frontdesk Review](https://frontdeskreview.com/software/leave-management/timetastic/)). Calamari includes entitlement and accrual rules at $2 per user ([Capterra](https://www.capterra.com/p/141217/Calamari/pricing/)). Vacation Tracker supports accruals and half-day requests ([Vacation Tracker](https://vacationtracker.io/blog/10-best-employee-vacation-trackers-free-paid/)). HiBob handles country rules such as German pro-rata allowances and exposes full, half or custom day portions ([HiBob](https://www.hibob.com/features/simple-time-off/); [Workato](https://docs.workato.com/en/connectors/hibob/new-updated-timeoff-request-trigger)).

**Competitors with it.** Timetastic, Calamari, Vacation Tracker, Factorial, Personio and HiBob.

**In OrgFlow.** Leave policies live in `workplace-core.js` so that browser, server and CLI share them. A policy covers annual entitlement, monthly or annual accrual, carry-over caps and expiry, and **pro-rating by position FTE and dated assignment**, which OrgFlow can compute from its timeline where most leave tools need manual input. It adds public-holiday calendars per office, imported as iCal or a bundled dataset, which also stop desk bookings on closed days. Max-absent rules per team are checked at request time and enforced by the server. Balances appear in My week and the Teams tab, with decisions kept under the existing three-year retention. Half-day leave should be a deliberate second phase. The project's own convention is "workplace features are full days only", so half days touch every rule and test. That cost is real, though Vacation Tracker and HiBob show the demand.

**Effort: L,** of which balances, accrual, holidays and max-absent are M and half days M.

**Why fourth.** Without balances, OrgFlow's vacation approval cannot replace even a $2 tool, and the gap is listed in its own "not in the first release" notes. Evidence comes from tier packaging rather than surveys, but it is consistent across vendors.

### 5. Two-way Outlook/Places and Google Calendar work-location sync

**Market evidence.** Microsoft now gives work-location plans, team guidance and Places Finder to most M365 users ([MC1235124](https://mc.merill.net/message/MC1235124); [Microsoft Places](https://www.microsoft.com/en-us/microsoft-teams/microsoft-places)). Teams Wi-Fi auto-detection of office presence rolled out from June 2026 ([MC1081568](https://mc.merill.net/message/MC1081568)). Google Calendar's working location has had read and write API access since 2023, and desk vendors such as Comeen and Yoffix sync it to auto-reserve desks ([Google Developers](https://developers.googleblog.com/en/use-working-locations-with-the-calendar-api-for-apps-and-workflows/); [Comeen](https://support.comeen.com/en/articles/12120016-synchronizing-the-google-calendar-working-location)). Employees will not keep two calendars.

**Competitors with it.** Microsoft Places (native), OfficeRnD (Google Calendar extension, Outlook), Comeen, Yoffix, Skedda and Tactic (M365 and Google), and YAROOMS (Business tier).

**In OrgFlow.** A host connector, using the same Graph app registration as rank 1, mirrors My week days with Outlook work location and Google working-location events. An administrator chooses which side wins per tenant. Conflicts are recorded in the existing seating-conflict and notification flow rather than resolved silently. The server applies the existing rules: approved vacation overrides, and a remote day frees the person's assigned desk for sharing.

**Effort: M.**

**Why fifth.** Microsoft's April 2026 move makes this defensive and urgent for a Teams-first product. It ranks below leave because leave is OrgFlow-only value, while sync preserves value OrgFlow already has. **Thin evidence flag:** the Graph endpoint for reading and writing a user's work-location plan was not confirmed in this research, so verify it before committing. The Google side is confirmed.

### 6. Attendance policies, team anchor days and works-council-safe reporting

**Market evidence.** CBRE finds 89% of employers require three or more days while attendance averages 2.9 against a 3.2-day target, and colleague engagement (77%) is what draws people in ([CBRE](https://www.cbre.com/insights/reports/2026-americas-office-occupier-sentiment-survey); [Allwork.space](https://allwork.space/2026/07/the-office-comeback-faces-one-big-problem-workers-still-arent-showing-up/)). Compliance measurement reportedly rose to 69% of companies from 45%, a CBRE-derived figure reported by an aggregator ([Archie](https://archieapp.co/blog/return-to-office-statistics/)). Microsoft Places has manager "team guidance", OfficeRnD has Anchor Days and office-day suggestions, Kadence recommends days based on colleagues, and YAROOMS has work-from-home limits and attendance reports ([OfficeRnD](https://www.officernd.com/hybrid-work-software/collaborative-scheduling/); [Software Advice](https://www.softwareadvice.com/scheduling/yarooms-profile/)). In Germany, any tool that can trace individual attendance triggers works-council co-determination, "even if no monitoring is intended" ([Pult](https://www.pult.com/blog/desk-sharing-work-council)).

**Competitors with it.** Microsoft Places, OfficeRnD, Kadence, YAROOMS, Envoy (self-attendance) and Eptura (Workplace Experience Agent).

**In OrgFlow.** A policy object per group sets a weekly target, anchor days and work-from-home limits. Suggested office days come from relationships OrgFlow already holds: manager, team, dotted-line colleagues and seat neighbors. Desk tools approximate these with favorites. Reporting is **aggregate-only by default**, with a minimum group size, no individual attendance export unless an administrator enables it, and settings plus a data-inventory "works agreement pack" generated from the records and retention configuration. The server, not the UI, enforces the aggregation threshold.

**Effort: M.**

**Why sixth.** It meets the strongest hybrid-work demand signal with data competitors lack, and turns a legal risk into a selling point for European buyers. It sits below calendar sync because policy tracking is only as good as the location data feeding it.

### 7. SCIM provisioning, then SAML SSO, for the shared host

**Market evidence.** SSO and provisioning are the most consistent premium gates. Organimi limits SAML SSO (Okta, Azure AD, Google, JumpCloud, OneLogin) to Premium ([Organimi](https://www.organimi.com/?p=10254)), YAROOMS puts SSO in Enterprise ([Capterra](https://www.capterra.com/p/140364/YAROOMS/pricing/)), and Skedda and Timetastic Pro both offer SSO. WorkOS-style SSO and SCIM services charge about $125 per connection per month ([SSOJet](https://ssojet.com/blog/top-10-enterprise-sso-providers-2026)), which shows enterprises routinely ask for it.

**Competitors with it.** Organimi Premium, Skedda, YAROOMS Enterprise, Timetastic Pro, and enterprise tiers broadly.

**In OrgFlow.** SCIM 2.0 `/scim/v2/Users` and `/Groups` endpoints on the host create, update and deactivate members. A SCIM-only token type maps IdP groups to OrgFlow roles: admin, editor, subtree editor and scheduling-only employee. This automates the offboarding that the current `WORKPLACE_AUTO_ENROLL` flow cannot. SAML comes second. Most IdPs already speak OIDC, which OrgFlow supports, and SAML's XML signature handling would mean weighing a new runtime dependency against the project's no-new-dependencies convention.

**Effort: M.**

**Why seventh.** It is a procurement checkbox rather than a reason to choose OrgFlow, and OIDC already covers sign-in. **Thin evidence flag:** no source showed buyers making SCIM or SAML a hard requirement for org-chart tools specifically.

### 8. Span-of-control and layers analytics with delayering scenarios

**Market evidence.** Gartner predicted that through 2026, 20% of organizations would use AI to flatten structures and cut more than half of middle-management roles, while warning about manager overload ([Gartner, 2024](https://www.gartner.com/en/newsroom/press-releases/2024-10-22-gartner-unveils-top-predictions-for-it-organizations-and-users-in-2025-and-beyond)). Its 2026 predictions warn that poorly planned AI layoffs lead to rehiring about 30% of those cut, at higher cost ([Certinia-hosted Gartner report](https://www.certinia.com/landing/gartner-ai-report/)). Average span reportedly rose from 10.9 to 12.1 direct reports, a Gallup figure cited secondhand ([People Managing People](https://peoplemanagingpeople.com/hr-strategy/ai-middle-management/)). Spans and layers are standard in planning tools ([Capterra: Agentnoon](https://www.capterra.com/p/10003093/Agentnoon)).

**Competitors with it.** Orgvue, Agentnoon/Dayforce SWP, ChartHop (Data Explorer) and Visier.

**In OrgFlow.** A pure function in `orgflow-core.js` computes span distribution, layer count, managers below or above a target span, and single-direct-report managers. It sits beside the existing single-person-dependency summary. A dashboard in the planning UI compares Current with any scenario, so "remove layer N" becomes a measurable Draft. An MCP `org_shape` tool exposes the same numbers. Positions rather than people define spans, so vacancies are handled correctly.

**Effort: S.**

**Why eighth.** It has the best value-to-effort ratio on the list and fits the scenario engine, but it is a planning enhancement rather than an adoption blocker. The analyst evidence is partly secondhand.

### 9. Approvals and commands in Teams chat, then a Slack app

**Market evidence.** Chat-native approval is standard among leave tools and a premium lever. HiBob approves time off from Slack or Teams ([HiBob](https://www.hibob.com/features/simple-time-off/)), Vacation Tracker approves in Slack, Teams or Google ([Vacation Tracker](https://vacationtracker.io/plans-and-pricing/)), and Timetastic gates Slack and Teams to Pro ([Frontdesk Review](https://frontdeskreview.com/software/leave-management/timetastic/)). Among desk tools, OfficeRnD offers `/book-desk` in Slack, Kadence a chat bot in Teams and Slack, and Officely is Slack- and Teams-native ([OfficeRnD](https://www.officernd.com/integrations/slack-hybrid/); [Kadence help](https://help1.kadence.co/en/collections/17388388-instant-messaging-and-kadence-ai)). Pingboard sends Slack alerts and summaries ([Pingboard](https://pingboard.com/integrations)). Teams dominates mid-market. Slack matters for tech SMBs ([YAROOMS report](https://www.yarooms.com/reports/best-hybrid-workplace-software)).

**Competitors with it.** HiBob, Vacation Tracker, Timetastic Pro, OfficeRnD, Kadence, Officely and Pingboard.

**In OrgFlow.** The existing Teams notification bot gains Adaptive Card actions to approve or reject vacation and confirm or cancel bookings, plus a few commands: "where is my team this week", "book my usual desk", "who's out". All of them call the same server endpoints, so permissions stay server-enforced. A Slack app follows over the same endpoints. Teams chat commands are already on the "not in the first release" list.

**Effort: M.**

**Why ninth.** It raises daily engagement and approval speed and is clearly demanded, but it adds convenience on top of features rather than a capability that changes a buying decision.

### 10. Workplace and seat-demand tools in MCP and the CLI

**Market evidence.** On 6 October 2026, Robin launched a Claude connector that combines its maps and utilization data with HRIS new-hire lists or lease costs to draft seating and space plans ([PR Newswire](https://www.prnewswire.com/news-releases/robin-reinvents-space-planning-for-the-workplace-claude-first-302899566.html)). deskbird connects to Copilot ([YAROOMS](https://www.yarooms.com/blog/best-deskbird-alternatives)). On the HR side, MCP use to connect chat clients to tools rose from 33% to 57% among builders ([Theory Ventures](https://theoryvc.com/blog-posts/ai-in-practice-survey-2026)), and Omni HR expects "does it support MCP?" to become a baseline evaluation question ([Omni HR](https://www.omnihr.co/blog/mcp-for-hr)). Persistent office underuse keeps utilization data central to real-estate decisions ([Placer.ai](https://www.placer.ai/anchor/articles/july-2026-placer-ai-office-index-steady-in-the-summer-heat)).

**Competitors with it.** Robin (Claude), deskbird (Copilot), ChartHop, Nakisa, Visier and Orgvue for org and people data. No competitor in the sample was found to derive future desk demand from a position-level hiring plan.

**In OrgFlow.** The MCP server currently exposes org-chart and forecast tools only. New tools, gated by the existing `workplace` token scope, cover aggregate attendance and utilization (honoring rank 6's privacy threshold), desk availability, and **seat demand by office by month**. Seat demand comes from the 1–36 month forecast multiplied by attendance policy and checked against desk capacity in the seating plan. Agents may draft seating or desk-sharing changes as proposals, never apply them, mirroring `propose_changes`. Matching `orgflow` CLI commands and an update to the `orgflow-workplace` skill complete it.

**Effort: M.**

**Why tenth.** It is the cheapest way to match a launch from just this month, and it uses data only OrgFlow holds together: positions, hiring plan, attendance and seats. It ranks last because its value depends on ranks 5 and 6 producing trustworthy attendance data, and because the evidence for buyer demand is launch announcements rather than adoption data.
