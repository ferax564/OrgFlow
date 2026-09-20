'use strict';
const ref = name => ({ $ref:'#/components/schemas/'+name });
const str = {type:'string'}, obj = {type:'object',additionalProperties:true}, integer={type:'integer',minimum:1};
const array = items => ({type:'array',items});
const json = schema => ({'application/json':{schema}});
const param = (name,schema=str,required=false,location='query') => ({name,in:location,required,schema});
const body = schema => ({required:true,content:json(schema)});
const response = schema => ({description:'Success',content:json(schema)});
const object = (properties,required=[]) => ({type:'object',properties,required,additionalProperties:false});
function spec(version) {
  const schemas={
    Error:object({error:str,code:str,currentVersion:integer}),
    Position:{type:'object',required:['id','title'],properties:{id:str,title:str,managerId:str,secondaryManagerId:str,personId:str,fte:{type:'number',minimum:0},hiringState:{enum:['Filled','Vacant','Recruiting']},startDate:str,endDate:str},additionalProperties:true},
    Person:{type:'object',required:['id','name'],properties:{id:str,name:str,employeeNumber:str,capacityFte:{type:'number',minimum:0},skills:array(str)},additionalProperties:true},
    Scenario:{type:'object',required:['id','name','positions','employees'],properties:{id:str,name:str,positions:array(ref('Position')),employees:array(ref('Person')),workflow:obj},additionalProperties:true},
    Planning:{type:'object',required:['version','scenarios','activeScenarioId'],properties:{version:{enum:[2,3]},schema:integer,workspaceId:str,revision:{type:'integer',minimum:0},lastCommittedAt:{type:'string',format:'date-time'},activeScenarioId:str,scenarios:array(ref('Scenario'))},additionalProperties:true},
    Workspace:{type:'object',required:['format','planning'],properties:{format:{enum:['orgflow.workspace']},version:integer,planning:ref('Planning'),branding:obj,view:obj,theme:{enum:['light','dark']},palette:str},additionalProperties:true},
    Context:object({workspaceId:str,revision:{type:'integer'},scenario:str,asOf:str,serverVersion:str,serverDocumentVersion:integer,scopePositionId:str}),
    Session:object({authenticated:{type:'boolean'},user:obj,tenant:obj,role:{enum:['admin','editor','viewer']},canExport:{type:'boolean'},canWrite:{type:'boolean'},isAdmin:{type:'boolean'},scopePositionId:str}),
    WorkspaceResult:object({workspace:ref('Workspace'),version:integer,updatedAt:str,ok:{type:'boolean'},session:ref('Session')}),
    Change:object({entity:{enum:['positions','employees','assignments','reportingLines','costs','allocations','commitments']},id:str,operation:{enum:['upsert','remove']},values:obj},['entity','id','operation']),
    Proposal:object({version:integer,name:{type:'string',maxLength:80},rationale:{type:'string',maxLength:3000},changes:{type:'array',maxItems:500,items:ref('Change')}},['version','name','rationale','changes']),
    Member:object({email:{type:'string',format:'email'},name:str,role:{enum:['admin','editor','viewer']},canExport:{type:'boolean'},scopePositionId:str},['email','role']),
    TokenRequest:object({name:str,scopes:{type:'array',minItems:1,items:{enum:['read','export','propose']},default:['read']},expiresInDays:{type:'integer',minimum:1,maximum:90,default:30}}),
    RpcRequest:{type:'object',required:['jsonrpc','method'],properties:{jsonrpc:{enum:['2.0']},id:{oneOf:[str,{type:'number'}]},method:str,params:obj},additionalProperties:false},
    QueryResult:{type:'object',properties:{context:ref('Context')},additionalProperties:true}
  };
  const paths={};
  function add(path,method,summary,schema=ref('QueryResult'),request,parameters=[],status='200',publicRoute=false){
    const errors=Object.fromEntries(['400','401','403','404','409','413','500'].map(code=>[code,{description:'Request failed',content:json(ref('Error'))}]));
    (paths[path] ||= {})[method]={operationId:method+'_'+path.replace(/[^a-zA-Z0-9]+/g,'_'),summary,parameters,responses:{[status]:response(schema),...errors},...(request?{requestBody:body(request)}:{}),...(publicRoute?{security:[]}:{})};
  }
  for(const path of ['/healthz','/readyz'])add(path,'get','Service/database health',object({status:str,version:str}),null,[],'200',true);
  add('/api/meta','get','Host capabilities',obj,null,[],'200',true);
  add('/api/session','get','Current authenticated identity',ref('Session'));
  add('/api/workspace','get','Scoped authoritative workspace',ref('WorkspaceResult'));
  add('/api/workspace','put','Save with optimistic concurrency',ref('WorkspaceResult'),object({workspace:ref('Workspace'),version:integer},['workspace','version']));
  add('/api/proposals','post','Create a Draft proposal; Current remains unchanged',obj,ref('Proposal'),[param('Idempotency-Key',{type:'string',maxLength:150},false,'header')],'201');
  add('/api/scenarios/{scenarioId}/decision','post','Authenticated scenario decision',ref('WorkspaceResult'),object({action:{enum:['metadata','comment','submit','withdraw','approve','reject','rebase','schedule','apply','rollback']},input:obj,version:integer},['action','version']),[param('scenarioId',str,true,'path')]);
  const scenario=[param('scenario'),param('asOf',{type:'string',format:'date'})];
  for(const route of ['summary','status','dotted-lines','vacancies'])add('/api/org/'+route,'get','Read '+route,ref('QueryResult'),null,scenario);
  add('/api/org/positions','get','Search visible positions',ref('QueryResult'),null,[...scenario,param('q')]);
  for(const [route,id] of [['people','personId'],['span','positionId']])add('/api/org/'+route+'/{'+id+'}','get','Read '+route,ref('QueryResult'),null,[param(id,str,true,'path'),...scenario]);
  add('/api/org/diff','get','Compare scenarios',ref('QueryResult'),null,[param('from'),param('to',str,true)]);
  add('/api/org/changes','get','Changes since a retained server revision',ref('QueryResult'),null,[param('sinceVersion',integer,true),...scenario]);
  for(const route of ['forecast','capacity-gap'])add('/api/org/'+route,'get','Deterministic staffing calculation',ref('QueryResult'),null,[...scenario,param('month'),param('months',{type:'integer',minimum:1,maximum:36}),param('group')]);
  for(const route of ['preview-proposal','validate-proposal'])add('/api/org/'+route,'post','Validate/preview without applying',obj,ref('Proposal'));
  add('/api/org/share-snapshot','post','Create a redacted offline share',obj,object({scenario:str,rootId:str,include:{type:'object',additionalProperties:{type:'boolean'}},initialDepth:{type:'integer',enum:[1,2,3,99]},html:{type:'boolean'}}));
  add('/api/exports','post','Authorize and audit export',obj,object({kind:str},['kind']));
  add('/api/reviews','get','Review assignments for this signed-in member',object({reviews:array(obj)}));
  add('/api/members','get','List organization members',object({members:array(obj)}));
  add('/api/members','put','Create or update membership',obj,ref('Member'));
  add('/api/members/{userId}','delete','Remove membership',obj,null,[param('userId',str,true,'path')]);
  add('/api/tokens','get','List token metadata',object({tokens:array(obj)}));
  add('/api/tokens','post','Issue an expiring limited credential',obj,ref('TokenRequest'),[],'201');
  add('/api/tokens/{tokenId}','delete','Revoke credential',obj,null,[param('tokenId',str,true,'path')]);
  add('/api/audit','get','Read audit log',object({events:array(obj)}),null,[param('limit',{type:'integer',minimum:1,maximum:500})]);
  add('/api/mcp','post','JSON-RPC read tools over authenticated HTTP',obj,ref('RpcRequest'),[param('MCP-Protocol-Version',str,false,'header')]);
  paths['/api/mcp'].post.responses['202']={description:'Notification accepted without a JSON-RPC response'};
  add('/api/openapi.json','get','API contract',obj);
  return {openapi:'3.0.3',info:{title:'OrgFlow API',version,description:'Cookie sessions support interactive administration. Tokens are limited to read/export/propose; effective access also requires membership permissions. Workspace versions are server concurrency tokens.'},security:[{sessionCookie:[]},{bearerToken:[]}],components:{schemas,securitySchemes:{sessionCookie:{type:'apiKey',in:'cookie',name:'orgflow_sid'},bearerToken:{type:'http',scheme:'bearer'}}},paths};
}
module.exports={spec};
