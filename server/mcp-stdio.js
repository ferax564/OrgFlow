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

const { mcpTools, APP_VERSION, MCP_PROTOCOL } = require('./lib/app');

const base = (process.env.ORGFLOW_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const token = process.env.ORGFLOW_API_TOKEN || '';
const allowProposals = process.env.ORGFLOW_ALLOW_PROPOSALS === 'true';

// MCP stdio uses one UTF-8 JSON-RPC message per line, not LSP Content-Length framing.
function write(msg) { process.stdout.write(JSON.stringify(msg)+'\n'); }
async function api(pathname, data) {
  const res=await fetch(base+pathname,{method:data?'POST':'GET',headers:{authorization:'Bearer '+token,accept:'application/json',...(data?{'content-type':'application/json',...(data.idempotencyKey?{'idempotency-key':data.idempotencyKey}:{})}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||res.statusText||'API error');return body;
}

const TOOL_ROUTES = {
  workforce_forecast: args => '/api/org/forecast?'+new URLSearchParams(Object.entries(args).filter(([,v])=>v!=null)),
  get_org: args => '/api/org/summary' + (args.scenario ? '?scenario=' + encodeURIComponent(args.scenario) : ''),
  search_positions: args => '/api/org/positions?q=' + encodeURIComponent(args.q || '') + (args.scenario ? '&scenario=' + encodeURIComponent(args.scenario) : ''),
  get_person: args => '/api/org/people/' + encodeURIComponent(args.personId) + (args.scenario ? '?scenario=' + encodeURIComponent(args.scenario) : ''),
  span_of_control: args => '/api/org/span/' + encodeURIComponent(args.positionId) + (args.scenario ? '?scenario=' + encodeURIComponent(args.scenario) : ''),
  dotted_lines: args => '/api/org/dotted-lines' + (args.scenario ? '?scenario=' + encodeURIComponent(args.scenario) : ''),
  list_vacancies: args => '/api/org/vacancies' + (args.scenario ? '?scenario=' + encodeURIComponent(args.scenario) : ''),
  diff_scenarios: args => '/api/org/diff?from=' + encodeURIComponent(args.from || 'current') + '&to=' + encodeURIComponent(args.to || ''),
  get_workspace_status: () => '/api/org/status',
  get_changes_since: args => '/api/org/changes?sinceVersion=' + encodeURIComponent(args.sinceVersion) + (args.scenario ? '&scenario=' + encodeURIComponent(args.scenario) : ''),
  explain_capacity_gap: args => '/api/org/capacity-gap?' + new URLSearchParams(Object.entries(args).filter(([, v]) => v != null))
};
const POST_TOOLS = {
  preview_proposal: '/api/org/preview-proposal',
  validate_proposal: '/api/org/validate-proposal',
  create_share_snapshot: '/api/org/share-snapshot',
  propose_changes: '/api/proposals'
};

async function handle(message) {
  if(!message||typeof message!=='object'||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string')return {jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}};
  if(!Object.hasOwn(message,'id'))return null;
  const id = message.id ?? null;
  const method = message.method;
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: MCP_PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'orgflow', version: APP_VERSION } } };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: mcpTools({allowProposals}) } };
  if (method === 'tools/call') {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    const route = TOOL_ROUTES[name];
    const post = POST_TOOLS[name];
    if (!route && !(post && (name !== 'propose_changes' || allowProposals))) return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown tool' } };
    try {
      const result = post ? await api(post, args) : await api(route(args));
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

let input='',chain=Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  input+=chunk;
  if(Buffer.byteLength(input)>2*1024*1024){console.error('MCP message exceeds 2 MB.');process.exitCode=1;process.stdin.destroy();return;}
  let end;
  while((end=input.indexOf('\n'))>=0){const line=input.slice(0,end);input=input.slice(end+1);if(!line.trim())continue;
    chain=chain.then(async()=>{let message;try{message=JSON.parse(line);}catch{write({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}});return;}
      try{const reply=await handle(message);if(reply)write(reply);}catch(error){write({jsonrpc:'2.0',id:message?.id??null,error:{code:-32600,message:'Invalid request'}});}
    });
  }
});
