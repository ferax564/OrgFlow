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
    Session:object({authenticated:{type:'boolean'},user:obj,tenant:obj,role:{enum:['admin','editor','viewer','employee']},canExport:{type:'boolean'},canWrite:{type:'boolean'},isAdmin:{type:'boolean'},scopePositionId:str,orgAccess:{type:'boolean'},employeeId:str,workplaceAdmin:{type:'boolean'}}),
    WorkspaceResult:object({workspace:ref('Workspace'),version:integer,updatedAt:str,ok:{type:'boolean'},session:ref('Session')}),
    Change:object({entity:{enum:['positions','employees','assignments','reportingLines','costs','allocations','commitments']},id:str,operation:{enum:['upsert','remove']},values:obj},['entity','id','operation']),
    Proposal:object({version:integer,name:{type:'string',maxLength:80},rationale:{type:'string',maxLength:3000},changes:{type:'array',maxItems:500,items:ref('Change')}},['version','name','rationale','changes']),
    Member:object({email:{type:'string',format:'email'},name:str,role:{enum:['admin','editor','viewer','employee']},canExport:{type:'boolean'},scopePositionId:str,employeeId:str,workplaceAdmin:{type:'boolean'}},['email','role']),
    TokenRequest:object({name:str,scopes:{type:'array',minItems:1,items:{enum:['read','export','propose','workplace']},default:['read']},expiresInDays:{type:'integer',minimum:1,maximum:90,default:30}}),
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
  add('/api/workspace','put','Save with optimistic concurrency; 409 reservations_affected until acknowledgeReservations is set',ref('WorkspaceResult'),object({workspace:ref('Workspace'),version:integer,acknowledgeReservations:{type:'boolean'}},['workspace','version']));
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
  // Workplace planning: the same rules serve the browser and the Teams tab. Teams tabs send the signed session in X-OrgFlow-Session.
  const date={type:'string',format:'date'}, loc={type:'string',description:'office:<id>, remote, none (a day without plan) or clear (back to the weekly pattern)'};
  add('/auth/teams/sso','post','Exchange a Microsoft Entra ID token from the Teams tab for an OrgFlow session',object({sessionToken:str,expiresAt:str,landing:str,session:ref('Session')}),object({token:str},['token']),[],'200',true);
  add('/auth/session-token','post','Session token for the Teams sign-in pop-up (cookie session)',object({sessionToken:str,expiresAt:str}));
  add('/api/teams/messages','post','Bot Framework messaging endpoint (installation events); Bot Framework JWT required',obj,obj,[],'200',true);
  add('/api/workplace/me','get','Signed-in employee, offices, desk, approver, roles and the full-day notice',obj);
  add('/api/workplace/week','get','Effective plan per day with vacation, reservation and items needing attention',obj,null,[param('start',date,true),param('days',{type:'integer',minimum:1,maximum:31})]);
  add('/api/workplace/days','put','Set the work location for one or more dates (own record only)',obj,object({dates:array(date),location:loc},['dates','location']));
  add('/api/workplace/pattern','put','Replace the weekly pattern',obj,object({weekdays:{type:'object',additionalProperties:str,description:'1 = Monday … 7 = Sunday'}},['weekdays']));
  add('/api/workplace/offices','get','Offices with time zones',obj);
  add('/api/workplace/offices/{officeId}/map','get','Rooms and desk states of one office on one date (no owner names for visitors)',obj,null,[param('officeId',str,true,'path'),param('date',date,true),param('plans',{enum:['0','1']})]);
  add('/api/workplace/availability','get','Desk states of every room on one date (planners and workplace administrators)',obj,null,[param('date',date,true)]);
  add('/api/workplace/reservations','get','Own upcoming reservations, or scope=admin with office/from/to',obj,null,[param('scope'),param('office'),param('from',date),param('to',date)]);
  add('/api/workplace/reservations','post','Reserve a desk; 409 desk_taken / already_booked / desk_unavailable / own_desk',obj,object({deskId:str,date,employeeId:{type:'string',description:'Workplace administrators only'}},['deskId','date']),[],'201');
  add('/api/workplace/reservations/{reservationId}/cancel','post','Cancel a reservation; the response asks to confirm the work location',obj,object({reason:str}),[param('reservationId',str,true,'path')]);
  add('/api/workplace/conflicts','get','Open seating conflicts (own as owner, or all for administrators)',obj);
  add('/api/workplace/conflicts/{conflictId}/alternatives','get','Available desks in the same office on the conflict date',obj,null,[param('conflictId',str,true,'path')]);
  add('/api/workplace/conflicts/{conflictId}/resolve','post','Book another desk for the owner, move the visitor, or record an arrangement',obj,object({action:{enum:['book-owner','move-visitor','dismiss']},deskId:str,note:str},['action']),[param('conflictId',str,true,'path')]);
  add('/api/workplace/vacations','get','Own vacation requests and history',obj);
  add('/api/workplace/vacations','post','Request vacation; 409 overlap / no_approver',obj,object({start:date,end:date,note:{type:'string',maxLength:1000}},['start','end']),[],'201');
  add('/api/workplace/vacations/{requestId}','get','One request (requester, approver or OrgFlow administrator)',obj,null,[param('requestId',str,true,'path')]);
  add('/api/workplace/vacations/{requestId}','patch','New dates: pending requests are re-submitted, approved vacation gets a change request',obj,object({start:date,end:date,note:str},['start','end']),[param('requestId',str,true,'path')]);
  add('/api/workplace/vacations/{requestId}/cancel','post','Withdraw a pending request or ask to cancel approved vacation',obj,object({note:str}),[param('requestId',str,true,'path')]);
  add('/api/workplace/vacations/{requestId}/decision','post','Approve or reject (assigned approver only)',obj,object({decision:{enum:['approve','reject']},note:str},['decision']),[param('requestId',str,true,'path')]);
  add('/api/workplace/approvals','get','Approval inbox with the team’s absences',obj);
  add('/api/workplace/vacations/{requestId}/return','post','“Not my report”: the assigned approver hands a request back for routing',obj,object({note:str}),[param('requestId',str,true,'path')]);
  add('/api/workplace/admin/vacations/{requestId}/approver','put','Route a request to an approver; remember also saves a correction (OrgFlow administrators)',obj,object({approverId:str,remember:{type:'boolean'}},['approverId']),[param('requestId',str,true,'path')]);
  add('/api/workplace/reports','get','Own reports of wrong details, or all recent ones for OrgFlow administrators',obj);
  add('/api/workplace/reports','post','Report a wrong approver, desk, account link or role',obj,object({kind:{enum:['approver','desk','identity','role']},note:str},['kind']),[],'201');
  add('/api/workplace/reports/{reportId}/resolve','post','Close a report (OrgFlow administrators); the reporter is notified',obj,object({status:{enum:['resolved','dismissed']},note:str},['status']),[param('reportId',str,true,'path')]);
  add('/api/workplace/team','get','Team absence calendar',obj,null,[param('from',date,true),param('to',date,true)]);
  add('/api/workplace/notifications','get','In-app notifications (authoritative; Teams messages are copies)',obj);
  add('/api/workplace/notifications/read','post','Mark notifications read',obj,object({ids:{oneOf:[array(str),{enum:['all']}]}}));
  add('/api/workplace/directory','get','Employee search for administrators',obj,null,[param('q')]);
  add('/api/workplace/admin','get','Offices, rooms, sharing, closures, conflicts and approvers',obj);
  add('/api/workplace/admin/offices','put','Create or rename an office',obj,object({id:str,name:str,timezone:str},['name','timezone']));
  add('/api/workplace/admin/offices/{officeId}','delete','Remove an office without rooms',obj,null,[param('officeId',str,true,'path')]);
  add('/api/workplace/admin/rooms/{roomId}/office','put','Assign a seating room to an office; 409 reservations_affected unless confirm',obj,object({officeId:str,confirm:{type:'boolean'}}),[param('roomId',str,true,'path')]);
  add('/api/workplace/admin/sharing','put','Enable or disable sharing and set equipment for desks or a room',obj,object({deskIds:array(str),roomId:str,enabled:{type:'boolean'},equipment:str}));
  add('/api/workplace/admin/closures','post','Close an office, room or desk; 409 reservations_affected unless confirm',obj,object({officeId:str,roomId:str,deskId:str,start:date,end:date,reason:str,confirm:{type:'boolean'}},['officeId','start','end']),[],'201');
  add('/api/workplace/admin/closures/{closureId}','delete','Remove a closure',obj,null,[param('closureId',str,true,'path')]);
  add('/api/workplace/admin/approvers','put','Correct the approver derived from Current (OrgFlow administrators)',obj,object({employeeId:str,approverId:str},['employeeId']));
  return {openapi:'3.0.3',info:{title:'OrgFlow API',version,description:'Cookie sessions support interactive administration. Tokens are limited to read/export/propose; effective access also requires membership permissions. Workspace versions are server concurrency tokens.'},security:[{sessionCookie:[]},{bearerToken:[]}],components:{schemas,securitySchemes:{sessionCookie:{type:'apiKey',in:'cookie',name:'orgflow_sid'},bearerToken:{type:'http',scheme:'bearer'}}},paths};
}
module.exports={spec};
