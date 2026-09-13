#!/usr/bin/env node
/**
 * MCP stdio server for Cursor / Claude. Calls the OrgFlow REST API with a
 * member API token so subtree ACL and audit stay on the server.
 *
 *   ORGFLOW_API_URL=http://127.0.0.1:8787
 *   ORGFLOW_API_TOKEN=ofk_...
 *   node server/mcp-stdio.js
 */
'use strict';

const { mcpTools } = require('./lib/app');

const base = (process.env.ORGFLOW_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const token = process.env.ORGFLOW_API_TOKEN || '';

function write(msg) {
  const json = JSON.stringify(msg);
  const buf = Buffer.from(json, 'utf8');
  process.stdout.write(`Content-Length: ${buf.length}\r\n\r\n`);
  process.stdout.write(buf);
}

async function api(pathname) {
  const res = await fetch(base + pathname, {
    headers: { authorization: 'Bearer ' + token, accept: 'application/json' }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText || 'API error');
  return body;
}

const TOOL_ROUTES = {
  get_org: args => '/api/org/summary' + (args.scenario ? '?scenario=' + encodeURIComponent(args.scenario) : ''),
  search_positions: args => '/api/org/positions?q=' + encodeURIComponent(args.q || '') + (args.scenario ? '&scenario=' + encodeURIComponent(args.scenario) : ''),
  get_person: args => '/api/org/people/' + encodeURIComponent(args.personId) + (args.scenario ? '?scenario=' + encodeURIComponent(args.scenario) : ''),
  span_of_control: args => '/api/org/span/' + encodeURIComponent(args.positionId) + (args.scenario ? '?scenario=' + encodeURIComponent(args.scenario) : ''),
  dotted_lines: args => '/api/org/dotted-lines' + (args.scenario ? '?scenario=' + encodeURIComponent(args.scenario) : ''),
  list_vacancies: args => '/api/org/vacancies' + (args.scenario ? '?scenario=' + encodeURIComponent(args.scenario) : ''),
  diff_scenarios: args => '/api/org/diff?from=' + encodeURIComponent(args.from || 'current') + '&to=' + encodeURIComponent(args.to || '')
};

async function handle(message) {
  const id = message.id ?? null;
  const method = message.method;
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'orgflow', version: '1.0.0' } } };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: mcpTools() } };
  if (method === 'tools/call') {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    const route = TOOL_ROUTES[name];
    if (!route) return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown tool' } };
    try {
      const result = await api(route(args));
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32000, message: err.message } };
    }
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (id != null) return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
  return null;
}

if (!token) {
  console.error('Set ORGFLOW_API_TOKEN to a member token from the OrgFlow admin page.');
  process.exit(1);
}

let buffer = Buffer.alloc(0);
process.stdin.on('data', async chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) break;
    const json = buffer.slice(start, start + length).toString('utf8');
    buffer = buffer.slice(start + length);
    let message;
    try { message = JSON.parse(json); }
    catch { continue; }
    const reply = await handle(message);
    if (reply) write(reply);
  }
});
