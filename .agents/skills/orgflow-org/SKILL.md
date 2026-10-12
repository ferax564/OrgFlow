---
name: orgflow-org
description: Read the company organization chart in OrgFlow (people, positions, reporting lines, vacancies, span of control, scenario differences) with the orgflow CLI or its MCP server, and draft change proposals for human review. Use when the user asks who reports to whom, about open roles, team sizes or how a planned scenario differs from today.
---

# OrgFlow organization chart

OrgFlow is the source of truth for reporting lines; Teams and Microsoft 365 profiles are not. Everything here is read-only except proposals, which are drafts for people to review: an agent never approves or applies an organization change.

## Access

- Commands run with the user's personal token and see exactly what the user may see in OrgFlow. A member limited to a branch (subtree) only gets that branch; scheduling-only members get no organization data at all (403). Do not try other routes to get around a refusal.
- The token needs the **read** scope. A workplace-only token answers "Token scope does not allow this operation"; the user creates a token with "Also read the organization chart" ticked under **CLI & agents**.
- Setup and the `node bin/orgflow.cjs` fallback are described in the orgflow-workplace skill: check with `orgflow whoami` first.

## Reading

```bash
orgflow org summary                 # headcount, positions, groups (add --json for the full structure)
orgflow org status                  # document version, scenarios, last change
orgflow org search "platform"       # positions by title, group, person, location, cost centre
orgflow org person EMP-008          # one person: position, manager, reports
orgflow org span POS-003            # span of control under a position
orgflow org vacancies
orgflow org dotted-lines
orgflow org diff SCENARIO_ID        # Current compared with a scenario; or: org diff FROM TO
orgflow org summary --scenario SCENARIO_ID
```

Without `--scenario`, answers describe **Current**, the live organization. Say which scenario an answer comes from whenever it is not Current, and treat people data as confidential: share only what the user asked for.

## MCP tools

`orgflow mcp` serves the same data as MCP tools (`get_org`, `search_positions`, `get_person`, `span_of_control`, `dotted_lines`, `list_vacancies`, `diff_scenarios`, `workforce_forecast`, `explain_capacity_gap`, `preview_proposal`, `validate_proposal`) with the saved login:

```bash
claude mcp add orgflow -- orgflow mcp      # Claude Code
codex mcp add orgflow -- orgflow mcp       # Codex
```

## Proposals

When the user wants a change (a move, a new position, a different manager), describe it, then use `preview_proposal` and `validate_proposal` to show its effect and any problems; both need a token with the **propose** scope (an editor or administrator creates it on the Admin page). Creating a Draft proposal (`propose_changes`) also needs the person running the MCP server to set `ORGFLOW_ALLOW_PROPOSALS=true`; confirm with the user before creating one. The proposal then waits for a human decision in the OrgFlow planner. Never claim a change has been made.

## Wrong data

If a reporting line, role or desk looks wrong, say so and point to the fix: an OrgFlow editor corrects the organization chart, and anyone linked to an employee record can file `orgflow report approver|desk|identity|role "note"` (after confirming with the user).
