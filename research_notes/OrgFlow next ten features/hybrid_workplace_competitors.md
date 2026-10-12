# Hybrid workplace, desk booking and absence management: competitor landscape (as of Oct 2026)

Method note: research date 2026-10-12. Direct page fetches (WebFetch/curl) were blocked by this environment's egress policy, so every finding below comes from web-search result summaries of the cited URLs; I could not open the pages myself. Prices in particular came from aggregators that often disagree with each other. Where sources conflict, both are given. Treat every price as "check before quoting".

OrgFlow baseline (from `_product_context.md`): full-day work-location planning ("My week"), vacation requests with manager approval, team absence view, desk booking/desk sharing, internal visitor reservations, notifications, records and retention, Microsoft Teams tab and notification bot, seating plans (rooms, desk blocks, auto-seat by team), REST API, MCP server and CLI. It does NOT have: half days, leave balances or accrual, auto-release of unused bookings, sensors, external visitors, Outlook work-location sync, Teams chat commands, Slack or Google Workspace integration, a mobile app, room booking, analytics dashboards, SSO/SCIM provisioning, or a hosted SaaS offering.

## 1. Vendors: headline features, target segment, published pricing

### Takeaway
The desk-booking market has split three ways. Microsoft Places is now bundled into Teams/M365 for coordination, with desks sold per space at about $2/desk/month. SMB per-user tools (deskbird, Officely, Kadence, Tactic, Gable) charge about $2.50–$5 per user or resource per month. Enterprise suites (Robin, Envoy, Eptura Engage, OfficeRnD) are mostly quote-based. Absence tools are cheap per user (about £1–£2.50, $2) and compete on accrual rules, public-holiday calendars and Slack/Teams approvals. Those are exactly OrgFlow's gaps.

### Cited Findings

**Microsoft Places / Teams / Outlook work location**
- On April 1, 2026, Places licensing moved from per-user (Teams Premium) to per-space. Places Finder and the Places app are available to most M365 users. Desk reservations, auto-release policies and space-based analytics need a Teams Shared Space license. Teams Premium holders keep premium Places features until their term ends. — [MC1235124 via mc.merill.net](https://mc.merill.net/message/MC1235124); [M365 Admin / handsontek](https://m365admin.handsontek.net/microsoft-teams-upcoming-changes-microsoft-places-licensing-feature-access/); [tomtalks.blog](https://tomtalks.blog/microsoft-teams-april-2026-licensing-update-microsoft-places-and-advanced-town-hall-and-webinar-features-move-into-teams-core/); [erik365.blog](https://erik365.blog/2026/03/04/licensing-changes-for-microsoft-teams-and-microsoft-places/)
- Shared Space pricing: Microsoft Learn says one paid Microsoft Teams Shared Space (MTSS) license ($8/month) comes with three zero-priced Single Space licenses, so the effective rate is "about $2 per desk per month". Other sources cite $8.55 per license covering four desks plus one space. — [Microsoft Learn: buy/set up Shared Space licenses](https://learn.microsoft.com/en-us/microsoft-365/places/what-is-places/buy-set-up-teams-shared-space-licenses-desks); [Elia](https://www.elia.io/blog/microsoft-places-overview); [handsontek](https://handsontek.net/microsoft-places-licensing-changed-matters/)
- Check-in and auto-release: a desk is released if nobody checks in within a configurable window. Check-in works by plugging into a desk peripheral, entering the building, or replying to an email. Any user can use this on desks with a Shared Space license, and Teams Premium users bought before April 1, 2026 can use it on any desk. — [Microsoft Learn: Enable check-in and autorelease](https://learn.microsoft.com/en-us/microsoft-365/places/enable-auto-release)
- Desk modes are Bookable, Assigned, Offline and Drop-in. The Graph Places API covers buildings, floors, sections, rooms, desks, workspaces and room lists, and a community source reports a major v1.0 update in December 2025. — [Microsoft Graph Places API overview](https://learn.microsoft.com/en-us/graph/api/resources/places-api-overview?view=graph-rest-1.0); [Graph workspace resource (beta)](https://learn.microsoft.com/en-us/graph/api/resources/workspace?view=graph-rest-beta); [GitHub issue, littlebearapps](https://github.com/littlebearapps/outlook-assistant/issues/130)
- Employees set work location per day (office, remote, etc.) in Outlook/Teams and share a "location plan". Managers set "team guidance" (priority in-office days). Places recommends the best days to come in based on collaborators and meetings. — [Microsoft Teams: Microsoft Places page](https://www.microsoft.com/en-us/microsoft-teams/microsoft-places); [Microsoft Inside Track](https://www.microsoft.com/insidetrack/blog/enhancing-hybrid-work-with-ai-how-were-using-microsoft-places-to-empower-our-employees/); [Directions on Microsoft (2024)](https://www.directionsonmicrosoft.com/microsoft-re-announces-its-places-work-scheduling-app/)
- Teams Wi-Fi work-location auto-detect: admins map SSIDs/BSSIDs to buildings, and desk peripherals act as a second signal. It is off by default, users must consent, and it updates only during working hours. It requires Places. Message Center MC1081568 lists worldwide rollout in June 2026; other sources gave Sept or Dec 2025 dates. — [MC1081568](https://mc.merill.net/message/MC1081568); [Windows Latest, Jun 15 2026](https://www.windowslatest.com/2026/06/15/microsoft-teams-will-auto-detect-when-youre-at-the-office-via-wi-fi-roll-out-confirmed-but-you-can-opt-out/); [gbhackers](https://gbhackers.com/microsoft-adds-wi-fi-based-work-location-auto-detection-to-teams/)
- New Outlook for Windows release notes: "book a desk for the entire day in Space Finder" (May 8, 2026). — [Outlook for Windows (new) release notes](https://learn.microsoft.com/en-us/officeupdates/release-notes-outlook-new)
- Places occupancy insights use Teams Rooms data, and the expanded-presence and occupancy reports are aggregated and anonymized with tenant and user opt-in/out (2024 description). — [UC Today](https://www.uctoday.com/collaboration/microsoft-launches-places-app-for-seamless-flexible-working/); [Directions on Microsoft](https://www.directionsonmicrosoft.com/microsoft-re-announces-its-places-work-scheduling-app/)
- Microsoft has said new APIs are coming for third-party sensors to trigger room releases. — [Empowering.Cloud: Places in 2026](https://empowering.cloud/microsoft-places-in-2026-apis-desk-booking-and-copilot-context/); [Teams Insider podcast](https://www.teamsinsider.show/2111467/episodes/18546073-microsoft-places-in-2026-apis-desk-booking-and-copilot-context)
- Copilot quick room booking requires a Microsoft 365 Copilot license (third-party claim). — [Elia](https://www.elia.io/blog/microsoft-places-overview)

**Robin** (enterprise; Gartner MQ Leader 2026)
- Named a Leader in the first (April 2026) Gartner Magic Quadrant for Workplace Experience Applications. — [Robin press release](https://robinpowered.com/press-releases/robin-a-leader-in-the-2026-gartner-magic-quadrant)
- On October 6, 2026, Robin launched a "Workplace Management Connector for Claude" and "Space Planning in Claude". Claude combines Robin maps and utilization data with HRIS new-hire lists or lease costs to draft seating, re-org and space plans. It is available to One Workplace Platform customers. — [Yahoo Finance / Robin](https://finance.yahoo.com/technology/ai/articles/robin-moves-workplace-management-operations-130100751.html); [PR Newswire](https://www.prnewswire.com/news-releases/robin-reinvents-space-planning-for-the-workplace-claude-first-302899566.html)
- AI map generation from an uploaded file, plus move-management features. — [Robin press release](https://robinpowered.com/press-releases/robin-gives-teams-control-of-office-maps-with-new-move-management-capabilities)
- Available on Google Cloud Marketplace since July 9, 2026. — [PRWeb](https://www.prweb.com/releases/robin-workspace-platform-now-available-on-google-cloud-marketplace-302820423.html)
- Pricing is custom-quoted. One review site describes a free Starter plan for up to 15 users on one floor (desk and room booking, map, visitors, mobile app). — [Capterra](https://capterra.com/p/143909/Robin-Powered/pricing/); [b2breviews](https://www.b2breviews.com/reviews/robin/); [rework](https://resources.rework.com/tools/booking-scheduling/skedda-vs-robin)

**Envoy** (visitor management heritage; mid-market and enterprise)
- Workplace Standard is $3 and Premium $5 per active user per month (annual). Standard covers assigned desks and maps. Premium adds room and desk booking and occupancy analytics (aggregator, updated April 2026). — [G2 Envoy pricing](https://www.g2.com/products/envoy-workplace/pricing)
- Visitors are priced per location. One July 2026 source lists $109/month (Standard) and $362/month (Premium). Capterra lists $131 and $395. Desk and room reservations are about $60 per bookable resource per year. — [instacheckin](https://instacheckin.io/blog/envoy-pricing/); [Capterra](https://www.capterra.com/p/143721/Envoy/); [Skedda: Envoy alternatives](https://www.skedda.com/insights/best-envoy-alternatives)
- April 2026 release: desk lending (employees share their assigned desk on days they are out) and employee self-attendance. — [Envoy: What's new, April 2026](https://envoy.com/workplace-management/whats-new-at-envoy-april-2026-product-releases)
- Envoy's AI is in analytics (floor-plan recommendations, attendance forecasting). There is no employee-facing conversational agent, according to a competitor-authored guide. — [YAROOMS AI-ready guide](https://www.yarooms.com/blog/ai-ready-workplace-management-software-2026-guide); [OfficeSpace vs Envoy](https://www.officespacesoftware.com/compare/officespace-vs-envoy/)

**deskbird** (European SMB/mid-market, Teams-first)
- Sources disagree on pricing: Business at $3.75 per active user/month (annual) or $4.75 monthly; or €2.75/user/month; SaaSworthy lists €1.80 Starter and €3.80 Business. Professional and Enterprise are custom. There is no free plan. — [Guideflow](https://www.guideflow.com/blog/desk-booking-software); [Capterra](https://www.capterra.com/p/233108/deskbird/pricing/); [SaaSworthy](https://www.saasworthy.com/product/deskbird); [Archie](https://archieapp.co/blog/deskbird-alternatives/)
- Features: desk and room booking, floor plans, mobile apps, Teams as the primary integration with Slack secondary, an AI floor plan designer (Professional), "Agentic Workplace" connecting to Microsoft Copilot (single source), and Workplace Intelligence (utilization and attendance). — [YAROOMS: deskbird alternatives](https://www.yarooms.com/blog/best-deskbird-alternatives); [Archie](https://archieapp.co/blog/deskbird-alternatives/)
- $23M Series B in September 2025 for AI workplace intelligence. — [checkthat.ai](https://checkthat.ai/brands/deskbird)

**OfficeRnD Hybrid / Workplace** (SMB/mid-market; also flex-space operators)
- Suggests office days based on favorited colleagues, planned on-site meetings and policy requirements. Managers can bulk-book desks for a team. "Anchor Days" can be aligned to sprint rituals. — [OfficeRnD collaborative scheduling](https://www.officernd.com/hybrid-work-software/collaborative-scheduling/); [OfficeRnD tech campaign](https://www.officernd.com/campaign/workplace-tech/); [OfficeRnD WorkWise](https://www.officernd.com/campaigns/hybrid-validation-smart-scheduler/)
- Slack app with `/book-desk`, check-in and cancel, and a view of who is in. Plus a Google Calendar Chrome extension and Teams/Outlook integrations. — [OfficeRnD Slack integration](https://www.officernd.com/integrations/slack-hybrid/); [Help: Slack](https://help.officernd.com/en/articles/249120-integration-slack-in-workplace)
- Pricing conflicts: Start from $99/month and Professional $399/month, plus per-resource fees; or €240 and €480/month (OMR); or $139/month and up. — [Archie](https://archieapp.co/blog/officernd-alternatives/); [OMR](https://omr.com/en/reviews/product/officernd/pricing); [Software Advice](https://www.softwareadvice.com/meeting-room/officernd-hybrid-profile/)

**Skedda** (SMB to enterprise; per-space pricing)
- Pricing is per space with unlimited users. Starter is $99/month (15 spaces), Plus $149 (20), Premier $199 (25), with larger tiers at $249/35 and $349/45 spaces (re-verified June 18, 2026). Visitor and delivery management is +$99/month. — [Frontdesk Review](https://frontdeskreview.com/software/desk-booking/skedda/); [Skedda insights](https://www.skedda.com/insights/best-desk-booking-software)
- Rules and roles engine, floor plans, analytics, M365, Google, Teams and Slack integration, SAML SSO. — [Frontdesk Review](https://frontdeskreview.com/software/desk-booking/skedda/)

**Joan** (hardware-led: e-paper room displays; SMB to enterprise)
- Room-display subscriptions are €4.99, €9.99 or €19.99 per device per month. Enterprise+ starts at €999/month (20 devices, 200 users). Aggregators list a per-user plan starting at €49 or $49 (ambiguous). — [Joan room booking page](https://getjoan.com/room-booking/?v=0b3b97fa6688); [Joan desk booking guide](https://getjoan.com/desk-booking-software/); [Capterra](https://www.capterra.com/p/180593/Joan/pricing/); [G2](https://www.g2.com/products/joan/pricing)
- 2025–26: conversational "Joan AI", ePaper visitor tags (ISE 2026), a multi-tenant native calendar, the MyJoan mobile app, and parking reservations. — [Joan blog (ISE 2026)](https://blog.getjoan.com/author/joan/page/1); [Joan InfoComm 2026](https://getjoan.com/blog/infocomm-2026/)

**Kadence** (mid-market/enterprise, coordination-first)
- AI suggests the best office days based on when close colleagues will be in. Conversational booking in Teams and Slack via the Kadence AI bot with chat commands. The Teams app is a web-wrapped version of the full app. — [Archie](https://archieapp.co/blog/kadence-alternatives/); [deskbird vs Kadence](https://www.deskbird.com/compare/deskbird-vs-kadence); [Kadence help: Teams](https://help.kadence.co/en/articles/13368543-using-kadence-in-microsoft-teams); [Kadence help: IM and Kadence AI](https://help1.kadence.co/en/collections/17388388-instant-messaging-and-kadence-ai)
- Pricing is about $4/user/month (Capterra). deskbird's comparison says it is unpublished, annual with a 1-year minimum, and $250 per floor-plan upload. — [Capterra](https://www.capterra.com/p/229863/Kadence/); [deskbird comparison](https://www.deskbird.com/compare/deskbird-vs-kadence)

**Tactic** (SMB/mid-market, module pricing)
- Desks, rooms, visitors, requests, move management and utilization analytics on a live map. Integrates with Teams, Outlook, Slack and Google Workspace. Sources disagree on price: the vendor shows $3 and $4 per workspace; G2 lists desks $3/user, rooms $5 and visitors $99 flat. — [Tactic](https://www.gettactic.com/); [Tactic pricing](https://gettactic.com/pricing-for-workplace-management-solutions); [G2](https://www.g2.com/products/tactic/pricing)

**Gable** (US SMB/mid-market; also on-demand coworking)
- Essentials is $4 per bookable resource/month and includes attendance insights. Visitors are $199 per location/month. Pro is custom ($249/location visitors). Its blog and G2 show lower figures ($2.50–$3/seat). — [Gable pricing](https://www.gable.to/pricing); [G2](https://www.g2.com/products/gable/reviews)
- Reporting combines badge, Wi-Fi, HRIS and booking data for utilization and attendance insights. — [G2](https://www.g2.com/products/gable/reviews)

**Eptura Engage (formerly Condeco)** (enterprise; Gartner MQ Leader 2026)
- Condeco has been renamed Eptura Engage. Its "Workplace Experience Agent" recommends workspaces and coordinates team presence. An April 28, 2026 release added AI workflows and real-time data visibility, rolling out through July 2026. An earlier Copilot for Eptura Engage worked inside Teams. — [Eptura Engage](https://eptura.com/our-platform/eptura-engage/); [BusinessWire, Apr 28 2026](https://www.businesswire.com/news/home/20260428174867/en/Eptura-Introduces-New-Innovations-Delivering-Real-Time-Data-Visibility-and-AI-Powered-Workflows-to-Scale-Workplace-and-Operations-Management); [Eptura Gartner page](https://eptura.com/gartner)
- Hourly personal-space booking was added after users asked for more than AM/PM slots. — [Eptura ideas forum](https://ideas.eptura.com/forums/966378-eptura-engage/suggestions/38568157-desk-booking-periods)

**YAROOMS** (EU mid-market)
- Starter is $200/month (desk, room, visitor, multilingual, mobile). Business is $500/month (interactive map, hybrid planning, analytics, M365 and Google). Enterprise adds SSO, Teams, a carbon dashboard and API access. — [Capterra](https://www.capterra.com/p/140364/YAROOMS/pricing/); [GetApp](https://www.getapp.com/collaboration-software/a/yarooms/)
- Hybrid Work Calendar: daily location, occupancy thresholds, work-from-home limits, attendance reports. — [Software Advice](https://www.softwareadvice.com/scheduling/yarooms-profile/)

**Officely** (Slack/Teams-native SMB)
- Free for up to 5 users. Basic is $2.50/user/month annual ($3 monthly). Premium is $3.50 annual ($4.50 monthly). Enterprise is custom. — [Officely pricing guide](https://getofficely.com/blog/officely-pricing-guide); [Officely SMB pricing](https://getofficely.com/blog/officely-pricing-for-small-business)
- Shows who will be in and office events inside Slack/Teams, parking booking, admin attendance trends, and automated team days (testimonial). — [Officely enterprise: attendance visibility](https://enterprise.getofficely.com/solutions/attendance-visibility); [Officely blog](https://getofficely.com/en-gb/blog/officely-increase-office-attendance)

**Zoom Workplace** (bundled with UC suite)
- Workspace reservations (desk and room) appear as a Zoom Workplace feature. Per-seat pricing for reservations was not found. Pro is about $13.33–$14.16/user/month and Business about $18.33. — [G2 Zoom Workplace pricing](https://www.g2.com/products/zoom-workplace/pricing); [MeetGeek](https://meetgeek.ai/blog/zoom-price-plans); [Costbench](https://costbench.com/software/communication/zoom/)
- Zoom is among the vendors evaluated in Gartner's 2026 Workplace Experience Applications MQ. — [Gartner abstract](https://www.gartner.com/en/documents/7675861)

**Absence / leave tools**
- **Timetastic** (UK SMB): sources disagree on the Base price (£1, £1.20 or £1.50/user/month). Pro is about £2 or $2.50/user/month and adds booking limits, trends, reports, Slack/Teams integration, SSO, accrued leave and capped leave types. Base includes max-absent rules, mobile apps and public holidays for 250+ countries. — [Capterra](https://www.capterra.com/p/146655/Timetastic/pricing/); [Frontdesk Review, Sept 2026](https://frontdeskreview.com/software/leave-management/timetastic/); [GetApp](https://www.getapp.com/communication-software/a/timetastic/)
- **Vacation Tracker** (Slack/Teams/Google-native): Core is per user with a $25 minimum. A Nov 2024 snapshot showed $2/user/month. It supports half-day requests (approve, deny or modify), automated accruals, and approvals in Slack, Teams or Google Workspace. — [Vacation Tracker pricing](https://vacationtracker.io/plans-and-pricing/); [Vacation Tracker blog](https://vacationtracker.io/blog/10-best-employee-vacation-trackers-free-paid/)
- **Calamari** (EU SMB): Time Off is $2/user/month and includes an absence calendar, approval flows, and entitlement and accrual rules. Time & Attendance is $2.50. — [Capterra](https://www.capterra.com/p/141217/Calamari/pricing/); [Software Advice](https://www.softwareadvice.com/hr/calamari-profile)
- **Factorial** (EU SMB HRIS): from £5.40/user/month with modular plans. Time off has unlimited policies, custom absence types, counters and export. — [Factorial UK pricing](https://factorialhr.co.uk/pricing); [Factorial help: time off counters](https://help.factorialhr.com/about-time-off-counters)
- **Personio** (EU SMB/mid HRIS): Capterra places Absence Management in Core Pro (custom quote). Aggregators estimate about $6–$15/user. — [Capterra](https://capterra.com/p/158622/Personio/pricing/); [Costbench](https://costbench.com/software/hr/personio)
- **HiBob** (mid-market HRIS): time-off requests and approvals from Slack, Teams or the Bob app. Handles country rules such as German pro-rata allowance. The API exposes a day portion (full, half or custom hours). Pricing is custom (about $8–$12/employee/month per a review). — [HiBob simple time off](https://www.hibob.com/features/simple-time-off/); [Workato HiBob connector](https://docs.workato.com/en/connectors/hibob/new-updated-timeoff-request-trigger); [RemotelyTalents](https://www.remotelytalents.com/blog/hibob-review-features-pricing-competitors)

### OrgFlow feature map (have / partial / missing) vs competitors

| Capability | OrgFlow today | Who has it (examples) |
| --- | --- | --- |
| Daily work-location plan, see who's in | Have | MS Places, OfficeRnD, YAROOMS, Officely, Kadence (sources above) |
| Team/manager "priority days" / anchor days | Missing (no policy object) | MS Places team guidance; OfficeRnD Anchor Days |
| AI/recommended office days | Missing | MS Places, Kadence, OfficeRnD, Eptura agent |
| Desk booking | Have (full day) | All desk vendors |
| Half-day / hourly desk booking | Missing | Eptura hourly; Spacebring and Archie hourly/half/full ([Spacebring](https://www.spacebring.com/docs/resource-management/resources/hourly-desk-bookings); [Archie help](https://help.archieapp.co/en/articles/9426228-how-to-configure-bookable-desks)) |
| Check-in + auto-release | Missing | MS Places (Shared Space), Robin (meeting check-in) |
| Assigned-desk lending | Partial (desk sharing exists; lending flow not documented) | Envoy (Apr 2026) |
| Room booking | Missing | Robin, Envoy Premium, Skedda, Joan, Tactic, YAROOMS, MS Places |
| Interactive floor map | Partial (seating-plan drawing exists) | Nearly all, plus AI map generation (Robin, deskbird) |
| Visitors (external) | Partial (internal reservations only) | Envoy, Tactic, Gable, Skedda, Joan, YAROOMS |
| Parking | Missing | Joan, Officely |
| Occupancy/attendance analytics | Missing | Envoy, Gable, deskbird, YAROOMS, MS Places |
| Vacation approval | Have | All leave tools |
| Balances, accrual, carry-over | Missing | Timetastic Pro, Calamari, Vacation Tracker, Factorial, HiBob |
| Half-day leave | Missing | Vacation Tracker, HiBob |
| Public holidays per country | Not documented | Timetastic (250+ countries) |
| Max-absent rules | Not documented | Timetastic |
| Teams tab / notifications | Have | Kadence, deskbird, Officely |
| Teams/Slack chat commands, AI bot | Missing | Kadence AI bot; OfficeRnD `/book-desk`; Officely |
| Slack integration | Missing | OfficeRnD, Officely, Skedda, Tactic, Vacation Tracker |
| Google Calendar working location | Missing | OfficeRnD extension; Comeen and Yoffix sync |
| Outlook work-location sync | Missing | MS Places native |
| Wi-Fi/badge/sensor presence | Missing | Teams Wi-Fi auto-detect; Gable badge+Wi-Fi |
| AI connector/agent (MCP) | Have (MCP for org chart, not workplace) | Robin Claude connector (Oct 2026), deskbird Copilot |

### Inferences
- With per-user prices of $2–$5, buyers will not pay a premium for basic desk booking. OrgFlow's open, self-hosted model plus its org chart (teams, managers, positions) is the differentiator, because coordination features ("my team's anchor day", "my manager's office days") depend on good org data.
- Microsoft giving Places coordination features to all M365 users (April 2026) commoditizes plain "who's in" calendars for Microsoft shops. Third-party tools must sync with Outlook/Places work location rather than compete with it.
- The leave-tool tier shows the minimum viable absence feature set: balances and accrual, half days, country public holidays, max-absent rules, and Slack/Teams approvals.

### Gaps
- Could not open any vendor pricing page directly (network policy), so all prices are aggregator or search-summary figures and several conflict.
- No reliable published pricing for Robin, Kadence (confirmed), Zoom reservations add-on, Personio absence or HiBob time off.
- Could not confirm whether deskbird or MS Places support half-day desk slots.

## 2. Table stakes in 2026

### Takeaway
Table stakes in 2026: desk plus room booking, an interactive floor map, Outlook/Google calendar sync, a Teams app (Slack too for tech-heavy SMBs), mobile apps, check-in with auto-release, visitor management, and utilization/attendance analytics. For leave tools: balances and accrual, public holidays per country, and chat approvals. Half-day/hourly booking, parking, neighborhoods and RTO policy tracking are common in mid-market tiers but not universal.

### Cited Findings
- Robin's free Starter includes assigned and flexible seating, an interactive map, desk and room booking, visitor management, a mobile app and calendar integrations. This suggests the basics are now a free tier at enterprise vendors. — [b2breviews](https://www.b2breviews.com/reviews/robin/)
- Envoy gates room and desk booking plus occupancy analytics to Premium ($5) and assigned desks plus maps to Standard ($3). — [G2](https://www.g2.com/products/envoy-workplace/pricing)
- YAROOMS gates the interactive map, hybrid planning and analytics to its Business tier, and Teams, SSO and API to Enterprise. — [Capterra](https://www.capterra.com/p/140364/YAROOMS/pricing/)
- Skedda integrates Microsoft 365, Google Workspace, Teams and Slack and offers SAML SSO, with the rules engine depth varying by tier. — [Frontdesk Review](https://frontdeskreview.com/software/desk-booking/skedda/)
- Check-in and auto-release are part of Microsoft's own Places offering (Shared Space license). — [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/places/enable-auto-release)
- Visitor management is a separately priced module at most vendors: Envoy $109–$395/location/month, Gable $199–$249, Tactic $99, Skedda +$99. — [instacheckin](https://instacheckin.io/blog/envoy-pricing/); [Gable pricing](https://www.gable.to/pricing); [G2 Tactic](https://www.g2.com/products/tactic/pricing); [Frontdesk Review](https://frontdeskreview.com/software/desk-booking/skedda/)
- Parking: Joan and Officely offer parking booking. — [Joan](https://getjoan.com/?p=69451); [Officely](https://getofficely.com/en-gb/blog/officely-increase-office-attendance)
- Half-day and hourly booking: Spacebring supports hourly, half-day and full-day on one desk with per-slot availability. Eptura added hourly booking after customers asked for more than AM/PM. A UK public-sector system uses AM/PM/All-day slots. Outlook only added "book a desk for the entire day" in May 2026, suggesting partial-day is Places' default model. — [Spacebring docs](https://www.spacebring.com/docs/resource-management/resources/hourly-desk-bookings); [Eptura ideas](https://ideas.eptura.com/forums/966378-eptura-engage/suggestions/38568157-desk-booking-periods); [NI Direct desk booking guide](https://dttdocumentation-uiadmin-ppd.nidirect.gov.uk/DeskBooking/UserGuides/BookADesk.html); [Outlook release notes](https://learn.microsoft.com/en-us/officeupdates/release-notes-outlook-new)
- Attendance policy tracking: YAROOMS has work-from-home limits and attendance reports, Gable has attendance insights from badge, Wi-Fi and booking data, and Envoy has employee self-attendance. — [Software Advice YAROOMS](https://www.softwareadvice.com/scheduling/yarooms-profile/); [G2 Gable](https://www.g2.com/products/gable/reviews); [Envoy April 2026](https://envoy.com/workplace-management/whats-new-at-envoy-april-2026-product-releases)
- Desk booking check-in and check-out is marketed as an attendance-compliance data source next to badge data. — [Breakroom glossary](https://www.breakroomapp.com/glossary/office-attendance-tracking); [employee-monitoring.net](https://www.employee-monitoring.net/blog/employee-monitoring-return-to-office-attendance)
- Leave tools: Timetastic Base already includes public holidays for 250+ countries, max-absent rules and mobile apps. Accrual is in Pro. Calamari includes entitlement and accrual rules in its $2 Time Off plan. — [GetApp Timetastic](https://www.getapp.com/communication-software/a/timetastic/); [Capterra Calamari](https://www.capterra.com/p/141217/Calamari/pricing/)
- Google Calendar working location (office building choice) has existed since 2023 on eligible Workspace editions, with read/write API access. Desk vendors (Comeen, Yoffix) sync it and auto-reserve a favorite desk. — [Google Developers blog](https://developers.googleblog.com/en/use-working-locations-with-the-calendar-api-for-apps-and-workflows/); [Comeen support](https://support.comeen.com/en/articles/12120016-synchronizing-the-google-calendar-working-location); [Yoffix](https://yoffix.com/integrations/google)

### Inferences
- OrgFlow's biggest table-stakes holes for workplace buyers are room booking, check-in/auto-release, analytics, calendar work-location sync (Outlook and Google), and leave balances/accrual. Half days matter for both leave (very common) and desks (common in EU and public-sector deployments).
- External visitors and parking are usually paid add-ons, so they are lower priority than core booking and leave correctness.

### Gaps
- No independent buyer survey ranking which features are "must have". Table-stakes status is inferred from tier packaging across vendors.
- Neighborhoods/team zones: no source in this round explicitly documents them (OfficeRnD's Slack app filters by "neighborhood"; MS Places has "sections" in the API). Their prevalence is unverified.

## 3. 2025–2026 launches, especially AI

### Takeaway
The 2025–26 innovation front is AI: recommended office days and team coordination (MS Places, Kadence, OfficeRnD, Eptura), conversational booking bots in Teams/Slack (Kadence AI, Joan AI, Eptura Copilot), AI map generation (Robin, deskbird), and, newest, LLM connectors that combine workplace data with HRIS and finance for space planning (Robin + Claude, Oct 2026; deskbird + Copilot). Microsoft's big 2026 moves were licensing (coordination for all M365, per-space desks), Wi-Fi auto-detect, and the Places Graph API.

### Cited Findings
- Robin: Claude connector and Space Planning in Claude (Oct 6, 2026). "Additional connectors already in development." — [PR Newswire](https://www.prnewswire.com/news-releases/robin-reinvents-space-planning-for-the-workplace-claude-first-302899566.html); [Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/robin-moves-workplace-management-operations-130100751.html)
- Robin: AI map generation from an uploaded file, and an AI scheduling agent that books desks and spaces and resolves room conflicts. — [Robin press](https://robinpowered.com/press-releases/robin-gives-teams-control-of-office-maps-with-new-move-management-capabilities); [Robin](https://robinpowered.com/)
- Eptura: April 28, 2026 AI workflows and real-time data, with a Workplace Experience Agent that coordinates team presence. — [BusinessWire](https://www.businesswire.com/news/home/20260428174867/en/Eptura-Introduces-New-Innovations-Delivering-Real-Time-Data-Visibility-and-AI-Powered-Workflows-to-Scale-Workplace-and-Operations-Management); [Eptura Engage](https://eptura.com/our-platform/eptura-engage/)
- Envoy (April 2026): desk lending and employee self-attendance. Its AI is attendance forecasting and floor-plan recommendations. — [Envoy April 2026](https://envoy.com/workplace-management/whats-new-at-envoy-april-2026-product-releases); [YAROOMS guide](https://www.yarooms.com/blog/ai-ready-workplace-management-software-2026-guide)
- Microsoft: per-space licensing and coordination for all M365 users (April 1, 2026); Wi-Fi work-location auto-detect (MC1081568, June 2026 rollout); full-day desk booking in Outlook Space Finder (May 8, 2026); third-party sensor APIs announced. — [MC1235124](https://mc.merill.net/message/MC1235124); [MC1081568](https://mc.merill.net/message/MC1081568); [Outlook release notes](https://learn.microsoft.com/en-us/officeupdates/release-notes-outlook-new); [Empowering.Cloud](https://empowering.cloud/microsoft-places-in-2026-apis-desk-booking-and-copilot-context/)
- Microsoft Copilot in Places: natural-language scheduling, room finding and conflict rescheduling "via Work IQ" (podcast, date unclear). Copilot explaining why a day is good to come in was announced in 2024 as forward-looking, and its shipping status is unconfirmed. — [Teams Insider podcast](https://www.teamsinsider.show/2111467/episodes/19574433-microsoft-places-updates-explained-desk-booking-room-booking-and-ai-with-martin-boam-microsoft); [UC Today](https://www.uctoday.com/collaboration/how-to-use-copilot-with-microsoft-places-symity/); [Microsoft Copilot blog 2024](https://www.microsoft.com/en-us/copilot/blog/2024/05/13/ai-brings-new-life-to-flexible-work-with-microsoft-places/)
- Kadence: AI recommends office days based on close colleagues, and the Kadence AI chat bot works in Teams/Slack. — [Archie](https://archieapp.co/blog/kadence-alternatives/); [Kadence help](https://help1.kadence.co/en/collections/17388388-instant-messaging-and-kadence-ai)
- OfficeRnD: office-day suggestions (favorites, meetings, policy) and the WorkWise smart scheduler. — [OfficeRnD](https://www.officernd.com/hybrid-work-software/collaborative-scheduling/); [WorkWise](https://www.officernd.com/campaigns/hybrid-validation-smart-scheduler/)
- deskbird: "Agentic Workplace" connector to Microsoft Copilot and an AI floor plan designer (single-source). — [YAROOMS](https://www.yarooms.com/blog/best-deskbird-alternatives)
- Joan: conversational Joan AI (previewed Dec 2025), ePaper visitor tags, and the MyJoan app (ISE 2026). — [Joan blog](https://blog.getjoan.com/author/joan/page/1)
- Gartner published its first Magic Quadrant for Workplace Experience Applications on April 6, 2026. Leaders include Appspace, Eptura, Modo Labs and Robin. Envoy, Microsoft, OfficeSpace, ServiceNow, Zoom and others were evaluated. — [Gartner abstract](https://www.gartner.com/en/documents/7675861); [Appspace](https://www.appspace.com/blog/leader-in-first-ever-gartner-magic-quadrant/); [Modo Labs](https://modolabs.com/industry/enterprise/modo-labs-named-a-leader-in-the-2026-gartner-magic-quadrant-for-workplace-experience/)

### Inferences
- OrgFlow already ships an MCP server and agent skills, which is the same direction Robin announced in October 2026. Extending MCP/CLI to workplace data (attendance, utilization, desk plans), combined with org-chart and forecast data, would match a frontier capability at low cost and plays to OrgFlow's unique data (positions, hiring plan → future seat demand).
- "Recommended office days" needs org relationships (manager, team, collaborators). OrgFlow has those natively, unlike most desk tools, which rely on favorites or HRIS sync.

### Gaps
- No primary Microsoft 365 roadmap entries were retrievable for Places Copilot features. Ship status of Copilot day recommendations is unconfirmed.
- No 2026 changelogs found for deskbird, Kadence, Officely, Skedda or Tactic.

## 4. RTO / hybrid trend 2025–2026 and demand impact

### Takeaway
Mandates tightened, but attendance lags them. Hybrid is still the dominant arrangement for remote-capable US workers (about 52%). Employers increasingly require 3+ days (89% per CBRE) and measure compliance, while actual attendance stays below targets (2.9 vs 3.2 days) and well below 2019 (about 21–32% below per Placer.ai). This pushes demand toward attendance-policy tracking, team coordination ("make the office day worth it") and utilization data for real-estate decisions, not just desk reservations.

### Cited Findings
- Gallup (May 2026): 52% of US remote-capable employees are hybrid, 26% fully remote and 22% on-site. Hybrid has been relatively steady since 2022, and 6 in 10 want hybrid. — [Gallup indicator page](https://www.gallup.com/workplace/263510/importance-company-culture.aspx) (URL as returned by search; secondary sites cite 53/27/20 for Q1 2026: [neat.no](https://neat.no/resources/remote-work-in-2026-key-statistics-explained/))
- CBRE 2026 Americas Occupier Sentiment Survey (published July 30, 2026): 89% of employers require at least 3 days, up from 78% in 2025. Employers expecting 1–2 days fell to 11% from 23%. Average actual attendance is 2.9 days vs a 3.2-day target. Colleague engagement (77%) draws people in, while inconvenient location (62%) and lack of amenities (53%) hold them back. 47% rate their workplace experience insufficient. — [CBRE](https://www.cbre.com/insights/reports/2026-americas-office-occupier-sentiment-survey); [Allwork.space, Jul 2026](https://allwork.space/2026/07/the-office-comeback-faces-one-big-problem-workers-still-arent-showing-up/)
- Placer.ai Office Index 2026, visits vs 2019: Feb −31.9%; Mar −26.5%; Apr −29.1%; May −32.4% (per working day); Jun −21% (+8.5% YoY); Jul −23.6% (−0.7% YoY). Aug −32.5% per a secondary source. — [Placer.ai Feb](https://www.placer.ai/anchor/articles/placer-ai-february-2026-office-index-another-weather-tested-step-forward-for-rto); [Mar](https://placer.ai/anchor/articles/placer-ai-march-2026-office-index-the-rto-marches-on); [Apr](https://placer.ai/anchor/articles/april-2026-placer-ai-office-index-rto-progress-amid-gas-price-headwinds); [May](https://www.placer.ai/anchor/articles/may-2026-placer-ai-office-index-gains-hide-in-plain-sight); [Jul](https://www.placer.ai/anchor/articles/july-2026-placer-ai-office-index-steady-in-the-summer-heat); [CommercialSearch (Jun)](https://www.commercialsearch.com/news/office-visits-surpass-2019-levels-in-miami-placer-ai/)
- Kastle Back to Work Barometer: the record weekly average was 56.3% (week of Dec 8, 2025), with a peak day of 66.0% and Class A+ at 78.8%. A secondary blog reports 54.7% for the week of Sept 22, 2026 (Tuesday 65.3%), which is unverified. — [Kastle](https://www.kastle.com/?p=11938); [WorkTime](https://www.worktime.com/blog/statistics/return-to-office-statistics); [Voxbooster (unverified)](https://voxbooster.com/blog/hybrid-work-schedule-compliance-statistics-2026)
- Flex Index (2025 data, latest found): Structured Hybrid rose to 43% of US firms (Q2 2025) from 36%. 66% of those require 3 days, for an average of 2.82 required days. Fortune 500 full-time-in-office requirements rose from 13% (Q4 2024) to 24%. 67% of small firms (<500) are fully flexible. Flexible firms grow 1.7x faster (with BCG). — [Flex Report Q2 2025 (LSE)](https://www.lse.ac.uk/management/assets/documents/research/flex-index-reports/Flex-Report-Q2-2025.pdf); [Flex Report Q3 2025 (LSE)](https://www.lse.ac.uk/management/assets/documents/research/flex-index-reports/Flex-Report-Q3-2025.pdf); [Flex Index newsletter](https://flexindex.substack.com/p/is-everybody-headed-back-to-the-office)
- Compliance tracking: 69% of companies measure compliance (up from 45% in 2024) and 37% enforce it (up from 17%), CBRE-derived via aggregators. About 55% of Fortune 100 require 5 days (JLL via aggregator). Instagram moved US staff to 5 days from Feb 2, 2026. These are secondary sources. — [Archie RTO stats](https://archieapp.co/blog/return-to-office-statistics/); [WorkTime](https://www.worktime.com/blog/statistics/return-to-office-statistics); [HybridHero](https://hybridhero.com/blog/return-to-office-statistics-2026)
- Badge data proves entry, not sustained presence, and raises privacy and legal concerns in some jurisdictions. — [employee-monitoring.net](https://www.employee-monitoring.net/blog/employee-monitoring-return-to-office-attendance); [daysattheoffice](https://daysattheoffice.com/blog/rto-compliance-prove-office-attendance/)

### Inferences
- Demand is shifting from "book a desk" to "plan and prove attendance against policy, and make office days useful". OrgFlow's work-location plan plus org hierarchy can support team policy targets (e.g., 3 days/week, team anchor day) and manager-level compliance views. These should be aggregated and privacy-respecting, matching the anonymized-reporting stance Microsoft takes.
- Persistent underuse (attendance 20–30% below 2019) keeps utilization analytics valuable for real-estate decisions. OrgFlow's forecast (headcount by month) could translate into future desk demand, which no competitor in this sample was found to do from a position-level plan.

### Gaps
- Could not reach Kastle or Flex Index directly. The 2026 Kastle weekly figure and any 2026 Flex Index data are unverified.
- European attendance data (OrgFlow's likely early market) was not covered in this round.

## 5. Teams vs Slack vs Google Workspace for buyers

### Takeaway
No buyer survey ranks these directly. Vendor packaging and install base say Microsoft Teams/Outlook is the must-have for mid-market and enterprise: Microsoft now ships Places natively, and deskbird, Kadence and Eptura are Teams-first. Slack matters for tech and SMB buyers, and Slack-native tools (Officely, Vacation Tracker) win there. Google Calendar working-location sync is a secondary but real requirement for Workspace shops.

### Cited Findings
- Teams' last official count was 320M MAU (Oct 2023), with unverified 2026 claims of 360–365M. Slack is estimated at about 38–47M DAU (third-party estimates, and the metrics are not comparable). — [desk365](https://www.desk365.io/?p=41361); [tech-insider](https://tech-insider.org/slack-vs-microsoft-teams-2026/); [countly](https://countly.net/how-many-slack-users-are-there-in-2026-global-by-country)
- deskbird treats Teams as primary and Slack as secondary. Teams is included in Business pricing. — [YAROOMS](https://www.yarooms.com/blog/best-deskbird-alternatives); [Capterra](https://www.capterra.com/p/233108/deskbird/)
- Kadence's main strength is conversational coordination in Teams or Slack. — [deskbird vs Kadence](https://www.deskbird.com/compare/deskbird-vs-kadence)
- YAROOMS puts Teams integration only in its Enterprise tier and M365/Google calendar in Business, which shows Teams as a premium lever. — [Capterra](https://www.capterra.com/p/140364/YAROOMS/pricing/)
- Officely works inside Slack and Teams, and Vacation Tracker approves leave in Slack, Teams or Google Workspace. Timetastic gates Slack/Teams integration to Pro. — [Officely](https://enterprise.getofficely.com/solutions/attendance-visibility); [Vacation Tracker](https://vacationtracker.io/plans-and-pricing/); [Frontdesk Review](https://frontdeskreview.com/software/leave-management/timetastic/)
- HiBob allows approval from Slack, MS Teams or the app. — [HiBob](https://www.hibob.com/features/simple-time-off/)
- A review notes that Teams-centric products are less suited to Google Workspace or Slack-heavy organisations, so fit depends on the buyer's stack. — [YAROOMS report](https://www.yarooms.com/reports/best-hybrid-workplace-software)
- Robin added Google Cloud Marketplace availability in July 2026, a Google-side procurement channel. — [PRWeb](https://www.prweb.com/releases/robin-workspace-platform-now-available-on-google-cloud-marketplace-302820423.html)

### Inferences
- For OrgFlow, already Teams-first, the next Microsoft step is Outlook/Places work-location sync (read and write via Graph) plus Teams chat commands or approval cards. That gets ahead of Microsoft's native coordination instead of competing with it. A Slack app (approvals, "who's in", `/where`) is the cheapest way into tech SMBs. Google Calendar working-location sync via the Calendar API is a smaller, well-documented add.
- Because Microsoft now gives coordination features to all M365 users, OrgFlow's Teams value must come from things Places lacks: leave and approvals, org-aware planning, and self-hosting and data control.

### Gaps
- No quantitative buyer-preference survey (Gartner/Forrester/IDC) found on Teams vs Slack vs Google integration importance for workplace tools.
- Could not confirm the Graph endpoint for reading and writing users' work location/work plan (only the Places resource API was confirmed).
