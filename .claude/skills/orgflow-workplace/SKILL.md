---
name: orgflow-workplace
description: Plan where you work, request or change vacation, book or cancel a desk, see team absences and handle vacation approvals in OrgFlow with the orgflow CLI. Use when the user asks about their office or remote days, vacation, desk bookings, who is away, or pending approvals at their company.
---

# OrgFlow workplace from the command line

The `orgflow` CLI talks to the company's OrgFlow host with the user's personal token. It can do exactly what the user can do on the OrgFlow workplace screens, nothing more. The server enforces every rule: never try to work around an error.

## Before the first command

1. Find the CLI: `orgflow --version`. If it is not on the PATH but you are in an OrgFlow checkout, use `node bin/orgflow.cjs` in its place (or `npm run cli --`).
2. Check the connection with `orgflow whoami`. It prints the account, the linked employee, the assigned desk, the approver and whether the user approves vacation.
3. If it says there is no host or token, ask the user to create a token in OrgFlow under **CLI & agents** (`/workplace.html#agents`) and run `orgflow login --url https://their-host --token-stdin` themselves, or set `ORGFLOW_API_URL` and `ORGFLOW_API_TOKEN`. Never ask the user to paste a token into the chat, never print it, and never write it into a file in the project.

Add `--json` to any command when you need exact fields (ids, statuses) rather than the readable text.

## Rules to respect

- **Full days only.** Locations, vacation and desk reservations always cover whole days. There are no hours or half days; say so if the user asks for part of a day.
- Dates are `YYYY-MM-DD`, `today`, `tomorrow`, `+N` (days from today), ranges `2026-10-14..2026-10-16` and comma lists. "Today" follows the user's home office time zone, so read it from `orgflow week` instead of assuming. Past days cannot be changed.
- A day's choice wins over the weekly pattern; approved vacation wins over both. A day with no plan keeps the user's desk protected, so do not set `none` unless asked.
- A colleague's desk can only be booked while its owner is confirmed away and sharing is enabled. A confirmed reservation stays with the visitor even if the owner's plans change.
- Changing approved vacation creates a change request; the approved dates stay until the approver decides.

## Confirm before acting

Reading is always fine: `whoami`, `week`, `offices`, `desks`, `bookings`, `vacation list`, `team`, `approvals`, `conflicts`, `notifications`.

Before anything that changes data, tell the user exactly what you are about to do and wait for their yes:
booking or cancelling a desk, requesting, changing or cancelling vacation, approving or rejecting a request, handing a request back with `not-mine`, replacing the weekly pattern, and filing a `report`.
Setting the user's own location for days they named (`plan`) needs no extra confirmation when the request was explicit.

Approvals are decisions about other people. Show the request (person, dates, days, note) and let the user decide; never approve or reject on your own judgement. If a request is not for one of the user's reports, suggest `orgflow not-mine ID --note "…"` instead of rejecting it.

## Commands

```bash
orgflow whoami
orgflow week [DATE]                          # the week containing DATE
orgflow plan 2026-10-14..2026-10-15 remote   # LOCATION: office id or name, remote, none, clear
orgflow plan tomorrow zurich
orgflow pattern                              # show the weekly pattern
orgflow pattern mon=zrh tue=remote fri=-     # replace days of the pattern (- = no plan)
orgflow offices
orgflow desks zrh 2026-10-14 --available
orgflow book zrh 2026-10-14 [DESK]           # DESK label or id; first available if omitted
orgflow bookings
orgflow unbook RESERVATION_ID [--reason TEXT]
orgflow vacation                             # the user's requests
orgflow vacation request 2026-12-21 2026-12-24 [--note TEXT]
orgflow vacation change ID START END
orgflow vacation cancel ID
orgflow team [--from DATE] [--to DATE]       # team absence calendar
orgflow approvals                            # managers: waiting requests and team absences
orgflow approve ID [--note TEXT]
orgflow reject ID [--note TEXT]
orgflow not-mine ID [--note TEXT]
orgflow conflicts
orgflow notifications [--read-all]
orgflow report approver|desk|identity|role [NOTE]
```

## When something fails

The CLI exits 2 for a usage mistake and 1 for an error from the host; the message ends with a code in brackets when the host gave one.

| Message or code | Meaning | What to do |
| --- | --- | --- |
| 401 / "Check ORGFLOW_API_TOKEN" | Token missing, expired or revoked | Ask the user to create a new token and log in again |
| "Token scope does not allow" | The token lacks the `workplace` scope | Ask for a token created under **CLI & agents** |
| `not_linked` | The account is not linked to an employee record | Only an OrgFlow administrator can fix it; tell the user |
| `desk_taken`, `already_booked` | Someone booked it first, or the user already has a desk that day | Offer other desks from `orgflow desks OFFICE DATE --available` |
| `desk_unavailable` | The owner is not confirmed away, sharing is off, or it is closed | Pick another desk; do not ask the owner to change plans |
| `own_desk` | It is the user's own desk | No booking is needed |
| `on_vacation` | The user has approved vacation that day | No desk is needed; check the dates with the user |
| `overlap` | Another vacation request already covers some of those days | Show `orgflow vacation`; change that request instead |
| `pending_change`, `decided` | A change is already waiting, or the decision was already made | Show the request's current state |

If the approver, desk, role or identity shown is wrong, OrgFlow does not take it from Teams or Microsoft 365: file `orgflow report KIND "what is wrong"` (after confirming) so the administrators correct it.
