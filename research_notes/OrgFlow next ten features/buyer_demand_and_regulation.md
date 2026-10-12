# Buyer demand, integration demand and regulatory drivers for org chart, workforce planning and hybrid workplace software (2025–2026)

Research date: 2026-10-12. Method: web search plus page fetches. Several primary sites (eur-lex.europa.eu, trusaic.com, jacksonlewis.com, lewissilkin.com) could not be fetched from this environment because of DNS errors, so some regulatory points rely on search-result summaries of those pages or on the Directive's text as cited (marked below). Most market and pricing sources are vendor or competitor blogs with a commercial interest, so treat their figures as directional.

OrgFlow context, from `_product_context.md`: local-first browser app and optional self-hosted Node/SQLite host. It has OIDC (bring your own), an API, an MCP server, a CLI and a Teams app. It has CSV import only: no HRIS connectors, no SCIM, no Entra ID or Google directory sync, no compensation data, no mobile app, no multi-language UI and no hosted SaaS.

## 1. Voice of the customer: recurring complaints and requests in reviews and communities

### Takeaway
The dominant complaint in this category is that charts go stale. Buyers split into two groups:
- Those who pay a premium for live HRIS-synced tools (ChartHop, OrgChart, Sift).
- Those who choose cheap flat-rate chart tools and then suffer manual imports.

Cost per seat, sync glitches, sluggishness on large datasets and dated interfaces come next. I could not reach Reddit or Hacker News threads directly (search returned only thread titles), so the community voice here comes mostly from review-site summaries.

### Cited Findings
- **Staleness without HRIS sync.** Org charts kept outside the core HRIS need ongoing syncing or imports to stay accurate. One roundup notes that Organimi's integrations update every 4 hours, not instantly, and that it has no live HR sync. — [GoProfiles 2026 roundup](https://www.goprofiles.io/blog/best-org-chart-software-2026/); [FitSmallBusiness](https://fitsmallbusiness.com/best-org-chart-software/)
- **Pingboard.** Reviewer complaints include limited reporting, occasional slow-loading pages and integration glitches. Pricing reportedly rose after the Workleap acquisition, and some users report sync and reliability problems. — [Anywherer](https://www.anywherer.com/best-org-chart-software/); [OrgChart Studio comparison](https://www.orgchartstudio.com/blog/org-chart-software-comparison)
- **ChartHop.** It is the tool most often cited for live HRIS sync, but it is expensive and complex. Users report that it gets "buggy and clunky" with very large datasets, and the interface has a learning curve. Quote-based pricing starts at about $8 per employee per month with a $9K annual minimum, according to one source. — [OrgChart Studio](https://www.orgchartstudio.com/blog/best-org-chart-software); [Leapsome](https://www.leapsome.com/blog/8-best-org-chart-software-tools-for-2026)
- **Live sync is a selling point.** OrgChart (theorgchart.com) says it integrates with more than 50 HR systems and syncs roles, reporting lines and vacancies in real time. A G2 reviewer praised charts that "update instantly" from iSolved. The product has about 4.5 stars across roughly 270 G2 reviews. — [theorgchart.com automated charts](https://theorgchart.com/solutions/automated-charts/); [G2 OrgChart reviews](https://www.g2.com/products/OrgChart/reviews)
- **Directory-driven charts.** OneDirectory builds charts from Microsoft 365 and Entra ID data and starts at about $349 per month. — [OneDirectory blog](https://www.onedirectory.com/blog/best-org-chart-software/); [Softr roundup](https://www.softr.io/blog/best-org-chart-software)
- **Buyer advice.** Buyers are told to check that a tool supports their current HR software "to avoid duplicate work". — [People Managing People](https://peoplemanagingpeople.com/tools/best-org-chart-tools/)
- **Desk booking.** The recurring criticisms are cost and interface age. Per-user pricing "scales quickly at large headcounts", and it is poor value when hybrid staff come in only once or twice a week. Robin's interface is described by some reviewers as dated. — [Skedda: Robin alternatives](https://www.skedda.com/insights/best-robin-alternatives); [Gable](https://www.gable.to/blog/post/best-desk-booking-software)
- **Reddit.** An r/humanresources thread titled "What's your go-to org chart tool in HR? [USA]" exists, but its body was not retrievable. — search result only, no URL content retrieved

### Inferences
- **Highest-value gap.** "Chart is out of date" is the top pain point. OrgFlow's CSV-only import is its biggest competitive weakness on this axis. Scheduled or continuous sync from an HRIS or directory (Entra ID or Google Workspace first, then BambooHR, HiBob and Personio) would address the most common complaint.
- **Where OrgFlow can win.** Live-sync incumbents are criticised for price (ChartHop's $9K minimum) and complexity. A cheap or self-hosted tool that does sync well, and keeps scenario planning separate from synced "Current", targets the gap between Organimi-class and ChartHop-class tools.
- **Large-chart performance.** OrgFlow already virtualizes large charts. Complaints about ChartHop's performance on large datasets suggest this is worth stating explicitly in marketing.

### Gaps
- **Not retrieved:** I could not retrieve verbatim Reddit (r/humanresources, r/sysadmin, r/HRIS) or Hacker News threads, or vendor idea boards (ChartHop, Robin, Lucid).
- **Not found:** I found no citable evidence in 2025–2026 sources for these specific requests: "hide salaries / field-level privacy", "share chart externally", "mobile". They are common themes in my background knowledge but are unverified here.

## 2. Integration demand: HRIS share, unified APIs, directory sync, SCIM and SSO

### Takeaway
No reliable 2025–2026 SMB or mid-market HRIS share figures surfaced. The only hard number is Workday at about 9.8% of global HCM, from an Apps Run the World figure cited second-hand. Qualitative positioning is consistent across sources:
- BambooHR is the US SMB default.
- Rippling and HiBob lead the mid-market.
- Personio dominates European SMEs, especially Germany, the UK and the Netherlands.

Unified HRIS APIs cost roughly $50–$65 per connected customer per month, with mid-market contracts of $30K–$120K a year. That is expensive for a low-price or open-source product. SSO/SCIM-as-a-service runs about $125 per connection per month.

### Cited Findings
**HRIS positioning**
- **Workday.** Holds about 9.8% of the global HCM market, citing Apps Run the World's 2024–2029 forecast. Its cost-to-value is weakest in the 50–500 employee range. — [AirMason](https://www.airmason.com/blog/workday-vs-competitors-mid-market-hr/); [The People Stack](https://www.thepeoplestack.co/post/rippling-vs-workday-vs-bamboohr-decision-guide-2026)
- **BambooHR.** The "go-to HRIS for small and mid-sized businesses", typically 10–250 employees. Sources disagree on the band. — [Bindbee HRIS guide](https://bindbee.dev/blog/hris-systems-everything-you-need-to-know); [HRTechSaaS mid-market](https://hrtechsaas.com/blog/best-hr-software-mid-market-companies/)
- **Rippling.** The mid-market choice, with a sweet spot of about 100–500 employees. — [The People Stack](https://www.thepeoplestack.co/post/rippling-vs-workday-vs-bamboohr-decision-guide-2026)
- **HiBob.** Popular with "tech-forward" mid-market HR teams. — [HiBob blog](https://www.hibob.com/blog/best-hris-ease-of-use/) (vendor source)
- **Personio.** "Best for European mid-market (UK, Germany, Netherlands)". — [Rework: Personio alternatives](https://resources.rework.com/tools/hr-people/best-personio-alternatives)
- **Deel HR.** Free up to 200 employees, then from $5 per employee per month. Org charts are bundled into the HRIS. — [OrgPlease](https://orgplease.com/blog/best-org-chart-software-2026); [FirstHR](https://firsthr.app/compare/general/org-chart-software)

**Unified HRIS APIs**
- **Merge.** Does not publish list pricing. One competitor cites $650 per month for up to 10 production linked accounts, then $65 per linked account. Vendr's typical mid-market contract is $50K–$120K a year. — [Apideck](https://www.apideck.com/blog/top-merge-api-alternatives); [Vendr Merge](https://www.vendr.com/marketplace/merge-api)
- **Finch.** About $65 per connection per month on Starter, with volume discounts at 25 or more connections. Vendr's typical contract is $30K–$80K a year. — [Truto: Finch alternatives](https://truto.one/blog/what-are-the-best-alternatives-to-finch-for-employment-data-in-2026/); [Vendr](https://www.vendr.com/marketplace/merge-api)
- **Kombo.** A platform fee plus a flat per-customer connection fee, with unlimited API calls. No public prices. Kombo is EU-focused, with strong coverage of European HRIS. — [Knit: Kombo evaluation](https://getknit.dev/blog/a-detailed-evaluation-of-kombo-as-a-unified-hr-api-platform/); [Truto: Kombo alternatives](https://truto.one/blog/what-are-the-best-alternatives-to-kombo-for-hris-integrations-in-2026/)

**Directory, SSO and SCIM**
- **Entra ID licensing.** P1 costs $6 per user per month and P2 $9, so many Microsoft-shop customers already pay for directory data that a chart can read. — [SSOJet](https://ssojet.com/blog/top-10-enterprise-sso-providers-2026)
- **WorkOS.** SSO and SCIM at $125 per connection per month, with volume discounts. — [SSOJet](https://ssojet.com/blog/top-10-enterprise-sso-providers-2026)

### Inferences
- **Build vs buy.** A unified API at about $65 per customer per month is affordable for a hosted SaaS charging $5+ per employee per month. It is not affordable for free or self-hosted OrgFlow instances. Native connectors to a few open, well-documented sources are more viable:
  - Microsoft Graph (Entra ID: manager and directReports)
  - Google Workspace Directory API
  - BambooHR and Personio REST APIs

  A pluggable connector interface would let enterprises bring their own Merge or Kombo key.
- **Microsoft-first.** OrgFlow already ships a Teams app, so Entra ID sync is the natural first connector. Entra manager attributes are the most common "free" source of truth for reporting lines.
- **SAML and SCIM.** OrgFlow has OIDC only. SAML and SCIM user provisioning are standard enterprise checklist items, as the WorkOS and SSOJet market shows. SCIM into the shared host would cover member provisioning and deprovisioning.

### Gaps
- No quantified SMB or mid-market HRIS market share for 2025–2026 in the US or Europe. Analyst reports from Gartner, IDC and Apps Run the World are paywalled and were not retrieved.
- No direct evidence on how often buyers make SCIM or SAML a hard requirement for org-chart tools specifically.
- No data on Factorial, Gusto, ADP or SAP SuccessFactors share in this segment.

## 3. Regulatory drivers

### Takeaway
**EU Pay Transparency Directive.** The transposition deadline of 7 June 2026 has passed. Most Member States missed it, but there is no EU-level delay. First gender pay gap reports for employers with 150 or more workers are due 7 June 2027. Employers now need:
- gender-neutral job architecture: job levels, "categories of workers", and criteria of skills, effort, responsibility and working conditions
- pay ranges per role
- documented career progression criteria

These are position-level data that an org/position tool can hold.

**EU AI Act.** High-risk HR AI obligations now apply from 2 December 2027, under the Digital Omnibus, in force since 27 July 2026.

**German works councils.** Under §87(1) No. 6 BetrVG, works councils co-determine any desk booking or attendance tool that can trace individual behaviour.

**US.** Pay-range posting laws keep spreading, with Virginia, Maine and Connecticut amendments in 2026.

### Cited Findings
**EU Pay Transparency Directive (Directive (EU) 2023/970)**
- **Transposition status.** Status as of mid to late 2026, from secondary sources:
  - Full transposition: Slovakia, Lithuania, Italy and Malta, plus Greece (law published 6 July 2026, main obligations from 1 November 2026).
  - Partial transposition: Poland, Estonia (pre-employment pay range and pay-history ban in force from 13 July 2026), Czechia and Belgium (public sector).
  - Drafts in progress: Finland (bill to Parliament 9 July 2026), Denmark (targets 1 January 2027), the Netherlands (expected January 2027), and Latvia and Spain.
  - Ireland's draft omits pay gap reporting, and Ireland has notified a delay.
  - Sweden says it does not intend to submit a bill.

  A June 2026 tracker listed only Slovakia and Italy as fully compliant, so counts vary by date. — [Trusaic Aug 2026 update](https://trusaic.com/blog/eu-pay-transparency-directive-august-2026-transposition-update/); [Assessio June 2026 tracker](https://assessio.com/articles/pay-transparency-directive-country-tracker/); [Jackson Lewis](https://www.jacksonlewis.com/insights/eu-pay-transparency-member-states-near-transposition-finish-line); [VOW April 2026](https://www.vow.be/en/node/542); [beqom](https://www.beqom.com/blog/eu-pay-transparency-directive-transposition-by-country). Trusaic and Jackson Lewis content comes from search summaries; the pages were not fetchable.
- **No EU-level delay.** — [Lewis Silkin, 1 July 2026](https://www.lewissilkin.com/insights/2026/07/01/eu-pay-transparency-directive-2026-employer-compliance) (title and summary only)
- **Reporting duties.**
  - 250+ workers: report on the previous calendar year by 7 June 2027, then annually.
  - 150–249 workers: by 7 June 2027, then every three years.
  - 100–149 workers: by 7 June 2031, then every three years.
  - Fewer than 100 workers: no mandatory reporting.

  Reports cover the overall and median gender pay gap, gaps in variable pay, the share of women and men in each pay quartile, and the gap within each category of workers. — [Legal500 briefing](https://www.legal500.com/developments/thought-leadership/the-eu-pay-transparency-directive-how-companies-can-prepare-for-new-rules-on-equal-pay/); [TopSource](https://topsourceworldwide.com/insights/european-pay-transparency-what-hr-leaders-must-do-now/); [paygap.com](https://paygap.com/articles/understanding-eu-directive-2023-970)
- **Directive text (stated from the Directive; the eur-lex page could not be fetched in this session).** — [Directive (EU) 2023/970 on EUR-Lex](https://eur-lex.europa.eu/eli/dir/2023/970/oj/eng)
  - *Art. 4(4):* pay structures must allow assessment of "work of equal value" on objective, gender-neutral criteria agreed with workers' representatives where they exist. The criteria include skills, effort, responsibility and working conditions.
  - *Art. 5:* applicants get the initial pay or pay range before the interview, and employers may not ask for pay history.
  - *Art. 6:* employers must make pay-setting and career progression criteria accessible. Member States may exempt employers with fewer than 50 workers from the progression part.
  - *Art. 7:* workers have a right to information on average pay levels by sex for their category of workers.
  - *Art. 10:* a joint pay assessment with workers' representatives is required when the gap within a category is 5% or more, is not justified by objective, gender-neutral criteria, and is not remedied within six months.
  - *Art. 34:* the transposition deadline is 7 June 2026.

**EU AI Act (Regulation (EU) 2024/1689) and the Digital Omnibus**
- **Delay timeline.** The Annex III high-risk deadline, which covers employment uses (recruitment, selection, promotion, termination, task allocation, performance monitoring), moves from 2 August 2026 to 2 December 2027.
  - Political agreement on about 6–7 May 2026.
  - European Parliament endorsement on 16 June 2026.
  - Council adoption on 29 June 2026.
  - Entry into force on 27 July 2026.
- **Not removed, only postponed.** Obligations for risk management, documentation, human oversight and transparency still come. Most Article 50 transparency obligations still apply from 2 August 2026.

— [Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/); [Jones Walker](https://www.joneswalker.com/en/insights/blogs/ai-law-blog/yes-august-2-still-matters-the-eu-approved-a-high-risk-ai-delay-but-most-trans.html?id=102nbon); [DLA Piper](https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2026/The-Digital-AI-Omnibus-Proposed-deferral-of-high-risk-AI-obligations-under-the-AI-Act); [Ogletree](https://ogletree.com/insights-resources/blog-posts/eu-nears-approval-of-agreement-to-delay-rules-for-ai-use-in-employment-decisions/). One Usercentrics page contains contradictory "not formally delayed" text, which looks stale. — [Usercentrics](https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/)

**German works councils and GDPR (desk booking and attendance)**
- **§87(1) No. 6 BetrVG (technical monitoring).** Co-determination is triggered when a booking tool can collect attendance or usage data traceable to individuals, "even if no monitoring is intended". — [Pult: works council](https://www.pult.com/blog/desk-sharing-work-council); [anny.co](https://anny.co/en/blog/desk-sharing-works-agreement-legally-compliant-implementation-and-co-determination) (vendor blogs)
- **Case law.** LAG Baden-Württemberg (21 TaBV 7/24, 2024) held that the decision to introduce desk sharing, and a clean-desk policy as such, are not in themselves co-determined. LAG Düsseldorf classifies desk sharing differently, so the law is unsettled. — [Pult: works agreement](https://pult.com/blog/work-agreement-desk-sharing); [Buse](https://buse.de/en/blog-en/labor-law/new-work-desk-sharing-essential-rules-for-employers/)
- **Other provisions.** §87(1) No. 14 (mobile work) applies where desk sharing is paired with home-office rules. §90 requires informing the works council at the planning stage. — [officeefficient.de](https://www.officeefficient.de/en/blog/betriebsvereinbarung-desk-sharing); [Pult: labor law](https://pult.com/blog/desk-sharing-labor-law)

**US pay transparency**
- **New laws in 2026–2027.**
  - California: SB 642 defines "pay scale" as a good-faith range, effective 1 January 2026.
  - Virginia: ranges in all public and internal postings including promotions, with no size threshold, effective 1 July 2026.
  - Maine: 10+ employees, effective 29 July 2026.
  - Connecticut: HB 5003 adds the wage range and a benefits description in internal and public postings, effective 1 October 2026.
  - Delaware: 2027, with sources disagreeing on date and threshold.
- **Already in force.** About 13–16 states plus DC have laws in force, depending on the source.
- **Litigation.** Washington has seen more than 300 class actions since June 2024. NYC penalties reach $250K.

— [Cooley, July 2026](https://www.cooley.com/news/insight/2026/2026-07-06-show-me-the-money-or-the-wage-range-new-state-pay-transparency-laws); [Clockspot](https://www.clockspot.com/research/pay-transparency-laws-by-state); [Brightmine](https://www.brightmine.com/us/resources/u-s-pay-transparency-laws-by-state-and-locality/)

### Inferences
- **Pay transparency fit.** The Directive's "category of workers" and "work of equal value" concepts map directly onto positions. OrgFlow already separates positions from people and holds position budgets. The natural additions are:
  - job family, job level or grade, and a pay band (min/mid/max) on positions
  - a gender-neutral evaluation-criteria record
  - a pay-gap-by-category report with a 5% flag
  - exports for reporting

  This needs field-level access control: hide pay from editors, employees and subtree scopes. The Directive brings in a 2027 reporting cliff for 150+ employers and a works-council co-design requirement.
- **US posting laws.** Vacancies and recruiting seats need a pay-range field that is required before a seat can be published, for US posting compliance. This applies to internal postings too in Virginia and Connecticut.
- **Works councils.** OrgFlow's workplace module records per-person office or remote days and desk bookings, so it falls under §87(1) No. 6 in Germany. Useful features would be:
  - configurable data minimisation (aggregate-only views, short retention, no individual attendance export)
  - a documented "works agreement pack" (data inventory and role matrix)

  OrgFlow already has records and retention, which is a selling point to strengthen.
- **AI Act.** An AI assistant that only answers org questions or drafts proposals for human approval is likely outside Annex III if it does not make promotion, termination or task-allocation decisions. Proposal-only MCP plus human approval is the right governance stance until December 2027 and after.

### Gaps
- No primary EU Commission transposition tracker could be fetched.
- Germany and France transposition status was not found in results; both are notable absences given their market size.
- No 2025–2026 source found on data-residency demand specifically for org-chart or desk-booking tools.
- No source on GDPR DPIA expectations specific to org charts.

## 4. Pricing benchmarks, free tiers and self-hosting demand

### Takeaway
Dedicated org-chart tools have converged on cheap flat tiers or free-up-to-25. HRIS-bundled charts (Deel) and premium planning tools (ChartHop at about $5–8 per employee per month, $9K minimum) bracket the market. Desk booking runs about $2.50–$8 per user per month or per bookable resource (Envoy). No hard data on self-hosted or open-source demand was found.

### Cited Findings
**Org chart tools**
- **OrgPlease.** Free up to 25 people, then flat $19, $49 or $99 per month for up to 50, 200 or 1,000 people. — [OrgPlease](https://orgplease.com/blog/best-org-chart-software-2026) (vendor)
- **Organimi.** Described as free up to 25 with flat $10–20 per month paid plans. Another source says it now offers only a trial, so sources conflict. — [OrgPlease](https://orgplease.com/blog/best-org-chart-software-2026); [FirstHR](https://firsthr.app/compare/general/org-chart-software)
- **ChartHop.** Core from about $5 per employee per month, or $8 per employee per month with a $9K annual minimum. One source claims a free tier up to 150 employees, so sources conflict. — [Softr](https://www.softr.io/blog/best-org-chart-software); [OrgChart Studio](https://www.orgchartstudio.com/blog/org-chart-software-comparison); [Guideflow](https://www.guideflow.com/blog/org-chart-software)
- **Diagramming alternatives.** Lucidchart starts at $9 per user per month with a free tier of 3 documents. Visio costs about $5–15 per user per month. — [Softr](https://www.softr.io/blog/best-org-chart-software); [Forbes Advisor](https://www.forbes.com/advisor/business/software/best-org-chart-software/)

**Desk booking**
- **deskbird.** About $3.75 per user per month, with other figures of €2.50–3.50. It moved away from free and tiered plans in April 2026.
- **Robin.** About $5–8 per user per month estimated, or an entry point around $400 per month.
- **Envoy.** About $60 per bookable resource per year, or $5 per resource per month plus a platform fee.
- **OfficeSpace.** Quote only.

— [Archie](https://archieapp.co/blog/best-desk-booking-software/); [Skedda: Envoy alternatives](https://www.skedda.com/insights/best-envoy-alternatives); [Gable](https://www.gable.to/blog/post/best-hot-desk-booking-software); [Guideflow](https://www.guideflow.com/blog/desk-booking-software)

### Inferences
- **Free tier.** The market expects a free tier for small orgs (about 25 people). OrgFlow's fully free local-first browser app already beats this.
- **Paid opportunity.** The monetisable gap sits around HRIS sync and planning for 100–1,000 employee orgs, below ChartHop's $9K floor.
- **Pricing model.** Per-occupied-desk or per-resource pricing for workplace features fits hybrid economics better than per-user pricing, given the complaints about per-user cost.

### Gaps
- No survey data quantifying demand for self-hosted or open-source HR, org or desk tools in 2025–2026.
- No verified current vendor price pages; all figures come via third-party blogs.

## 5. AI and agent adoption against HR data

### Takeaway
HR AI adoption is polarised. SHRM's 2026 report finds 54% of HR functions have no AI and no 2026 plans, while Gartner says 82% of HR leaders plan agentic AI within 12 months. HCM vendors are shipping MCP servers and Claude connectors in 2026, and governance (audit trails, RBAC inheritance) is the top stated concern. OrgFlow's existing MCP server and its proposal-only design are well aligned with this.

### Cited Findings
- **SHRM 2026.** The State of AI in HR 2026 report surveyed 1,722 respondents in December 2025. 54% have not adopted AI in HR and have no 2026 plans. Recruiting is the most mature use, at 27%. A secondary write-up reports 39% adoption for talent functions, so figures conflict by definition. — [FutureFactors summary of SHRM](https://futurefactors.ai/ai-in-hr-2026-shrm-report/)
- **Gartner.** 82% of HR leaders plan agentic AI within 12 months. Over 40% of agentic AI projects will be cancelled by end of 2027 for cost, ROI or governance reasons. — via [TopExecRecruiting](https://www.topexecrecruiting.com/news-posts/ai-agents-for-hr) (secondary)
- **451 Research (S&P Global).** Of HR respondents, 52% want real-time audit trails, 43% want AI governance tools and 40% want automated regulatory monitoring. — via [TopExecRecruiting](https://www.topexecrecruiting.com/news-posts/ai-agents-for-hr) (secondary)
- **Vendor MCP launches.**
  - isolved launched a Connector for Claude and autonomous HR agents.
  - Darwinbox shipped an MCP server exposing HR actions under RBAC inherited from HR permissions.
  - Omni HR says "does it support MCP?" will be a baseline HRIS evaluation question by 2027.

  — [isolved press release](https://www.isolvedhcm.com/media-center/press-releases/claude-ai-agents-built-for-hr-outcomes); [Omni HR](https://www.omnihr.co/blog/mcp-for-hr); [Calamari](https://www.calamari.io/blog/mcp-for-hr-how-the-model-context-protocol-is-changing-what-ai-can-actually-do-in-your-hr-stack)
- **Builder survey.** Among builders, use of MCP to connect chat clients to tools and data rose from 33% to 57%. 43% rate security and governance 6–7 out of 7, the top pain point. — [Theory Ventures AI in Practice 2026](https://theoryvc.com/blog-posts/ai-in-practice-survey-2026)

### Inferences
- **What to deepen.** OrgFlow's read-plus-draft-only MCP with token scopes matches what governance-minded buyers ask for. Next steps:
  - per-tool audit logging of agent queries
  - RBAC inheritance (subtree scopes) for MCP
  - field redaction (pay) for agents
  - natural-language "what-if" scenario drafting that lands as a Draft proposal
- **Market timing.** MCP support is becoming an evaluation checklist item. OrgFlow can market this as a differentiator now, since most org-chart competitors do not advertise it. This is unverified: competitor MCP support was not systematically checked.

### Gaps
- No direct survey on demand for natural-language org queries or AI-drafted reorg scenarios specifically.
- The SHRM primary report was not fetched.

## 6. Accessibility, localization and mobile

### Takeaway
The European Accessibility Act has applied since 28 June 2025. For pure B2B employee-facing tools it is largely out of direct scope. However, national laws (France, Italy, Spain) and public-sector buyers pull internal tools in, and the practical baseline is WCAG 2.1 AA, moving to 2.2 AA via EN 301 549. I found no citable 2025–2026 data on localization or mobile demand for this category.

### Cited Findings
- **B2B scope.** Tools where every user acts professionally, including internal tools used by a customer's employees, are largely outside the EAA's consumer-focused scope. Self-serve B2B products with card checkout may be caught. — [BuildMVPFast decision tree](https://www.buildmvpfast.com/blog/european-accessibility-act-saas-decision-tree-2026)
- **National laws.** France (Loi 2005-102 Art. 47, covering large employers above €250M revenue), Italy and Spain bring internal B2B and employee systems into accessibility obligations. — [Karl Groves](https://karlgroves.com/the-european-accessibility-act-and-b2b-software-what-internal-platforms-must-comply-with/)
- **Standards.** EN 301 549 v3.2.1 maps to WCAG 2.1 AA. An update referencing WCAG 2.2 AA is expected in the Official Journal around late 2026, though sources conflict. — [sota.io](https://sota.io/blog/european-accessibility-act-eaa-2026-saas-developer-guide-wcag-en-301-549); [Level Access](https://www.levelaccess.com/resources/the-complete-guide-to-european-accessibility-act-eaa-compliance/)

### Inferences
- **Procurement.** A WCAG 2.1/2.2 AA conformance statement (VPAT or ACR) is a cheap procurement unblocker for public-sector and large French, Italian and Spanish buyers. Org charts as tree or canvas UIs are hard to make accessible, so an accessible list or outline view of the chart would be a differentiator.
- **Localization.** Personio, HiBob and Factorial dominate European SMEs, and Germany is a key works-council market, so a German UI is the logical first localization. This is an inference, not sourced.

### Gaps
- No 2025–2026 sourced data on mobile-app expectations for org-chart or desk-booking tools. Desk-booking competitors universally ship mobile apps, but this was not verified in this session.
- No sourced data on localization demand.
