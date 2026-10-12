@AGENTS.md

## Claude Code

- Skills in `.claude/skills/` load automatically: `/orgflow-workplace`, `/orgflow-org`, `/orgflow-develop`. Keep `.agents/skills/` identical when you edit one.
- To use OrgFlow from any project: `orgflow login --url https://your-host --token-stdin`, then `orgflow skills install --claude`, and optionally `claude mcp add orgflow -- orgflow mcp` for the organization-chart tools.
