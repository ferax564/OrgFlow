// Only preferences/cache use Web Storage; IndexedDB is the durable document store.
let storagePrefix = '';
const appStorage = {
  getItem: key => localStorage.getItem(storagePrefix + key),
  setItem: (key, value) => localStorage.setItem(storagePrefix + key, value),
  removeItem: key => localStorage.removeItem(storagePrefix + key)
};
function configureWorkspaceScope(session){
  const scope=session?{tenant:session.tenant.id,user:session.user.id,branch:session.scopePositionId||'',role:session.role,export:session.canExport}:null;
  storagePrefix=scope?'orgflow.account:'+JSON.stringify(scope)+':':'';
  OrgFlowStore.configureScope(scope);
}
/* OrgFlow UI. Domain rules live in orgflow-core.js. */
const {
  ROLE_TYPES, STATUSES, HIRING_STATES, LEGACY_ROLE_TYPES, POSITION_FIELDS, DIFF_FIELDS,
  POSITION_CSV_COLUMNS, ALIASES, CARD_DISPLAY_DEFAULTS, esc, slug, makeId, isISODate, cleanString,
  fmtDate, fteText, csvEscape, csvRows, positionCSVValues, detectDelimiter,
  parseCSV, headerMap, normalizeType, normalizeStatus, normalizeDate,
  validatePeopleData, validateScenarioData, validatePlanning, migrateLegacy,
  projection: projectScenario, totals, scenarioChanges, fieldValue,
  emptyWorkspace, sanitizeChipFilters, mergeChipSelection, wouldCreateCycle, validPersonPhoto,
  positionTypes, compareSiblings, nodeStacked, showsCumulativeCount, personLabel,
    sanitizeCardDisplay, cardMetrics, subtreePeopleCount, reorderSiblings, siblingIndex,
    applyCardSizes, layoutOrgChart, EMPTY_GROUP, EMPTY_SITE, filterLabel, chipValues,
    spanOfControl, pathToRoot, bulkPatchPositions, placeSibling, tileChartPages,
    sanitizeViewState, buildShareDataset, touchWorkspace, workspaceStamp, compareWorkspaceStamps,
    DOCUMENT_VERSION, buildBundle, parseWorkspaceOrBundle
} = OrgFlow;

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const svg=$('#chart'),wrap=$('#canvasWrap'),stage=$('#chartStage');
// Chart projection only; workspace.scenarios is the source of truth.
let people=[];
let activeRoles=new Set(ROLE_TYPES),activeStatuses=new Set(STATUSES),maxDepth=99,collapsed=new Set(),selectedId=null,pendingImport=null;
let activeGroups=null,activeSites=null,knownGroups=null,knownSites=null,selectedIds=new Set(),workspaceFileHandle=null,fileHandleNeedsReconnect=false,pathHoverId=null;
let cardDisplay=sanitizeCardDisplay(),stackedTouched=false;
const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
$('#asOf').value=today;

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2100)}
function uid(){return 'p-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)}
const PALETTES=['indigo','crimson','graphite','ocean','emerald'];
function setupTheme(){const saved=safeGet('orgflow.theme');const dark=saved?saved==='dark':window.matchMedia?.('(prefers-color-scheme: dark)').matches;let palette=safeGet('orgflow.palette');if(palette==='audi')palette='crimson';setPalette(PALETTES.includes(palette)?palette:'indigo',false);setTheme(dark?'dark':'light',false);updateThemeControls();render()}
function updateThemeControls(){const theme=document.documentElement.dataset.theme||'light',palette=document.documentElement.dataset.palette||'indigo';$('#themeBtn').innerHTML=theme==='dark'?'<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>':'<svg viewBox="0 0 24 24" fill="none"><path d="M20 15.2A8 8 0 0 1 8.8 4 8 8 0 1 0 20 15.2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';$('#themeBtn').title=theme==='dark'?'Switch to light mode':'Switch to dark mode';$$('#paletteMenu [data-palette]').forEach(b=>b.classList.toggle('active',b.dataset.palette===palette))}
function setTheme(theme,rerender=true){document.documentElement.dataset.theme=theme;safePreference('orgflow.theme',theme);updateThemeControls();applyBranding();if(rerender)render()}
function setPalette(palette,rerender=true){if(palette==='audi')palette='crimson';if(!PALETTES.includes(palette))palette='indigo';document.documentElement.dataset.palette=palette;safePreference('orgflow.palette',palette);updateThemeControls();if(rerender)render()}
let cssValueCache=null;
function cssVar(name){if(cssValueCache&&Object.hasOwn(cssValueCache,name))return cssValueCache[name];const value=getComputedStyle(document.documentElement).getPropertyValue(name).trim();if(cssValueCache)cssValueCache[name]=value;return value;}
function allPositionTypes(){return positionTypes(workspace?.positionLevels);}
function allGroups(){return chipValues(people,'group',EMPTY_GROUP)}
function allSites(){return chipValues(people,'location',EMPTY_SITE)}
function setupFilterChips(host,values,active,onToggle){
  if(!host)return;
  host.innerHTML='';
  values.forEach(r=>{
    const b=document.createElement('button');
    b.className='chip'+(active.has(r)?' active':'');
    b.textContent=r;b.dataset.value=r;b.setAttribute('aria-pressed',String(active.has(r)));
    b.onclick=()=>{active.has(r)?active.delete(r):active.add(r);b.classList.toggle('active',active.has(r));b.setAttribute('aria-pressed',String(active.has(r)));onToggle?.();render();};
    host.appendChild(b);
  });
}
function setupChips(){
  const types=allPositionTypes();
  setupFilterChips($('#roleChips'),types,activeRoles);
  setupFilterChips($('#statusChips'),STATUSES,activeStatuses);
  const groups=allGroups(),sites=allSites();
  activeGroups=new Set(mergeChipSelection(activeGroups,groups,knownGroups));
  activeSites=new Set(mergeChipSelection(activeSites,sites,knownSites));
  knownGroups=groups.slice();
  knownSites=sites.slice();
  setupFilterChips($('#groupChips'),groups,activeGroups);
  setupFilterChips($('#siteChips'),sites,activeSites);
  setupHiringChips();
  renderNamedViews();
  syncBulkBar();
}
function dateOk(p){if(!$('#dateFilter').checked)return true;const d=$('#asOf').value;if(!d)return true;return(!p.startDate||p.startDate<=d)&&(!p.endDate||p.endDate>=d)}
function buildFilteredForest(){
  const byMgr=new Map();people.forEach(p=>{if(!byMgr.has(p.managerId))byMgr.set(p.managerId,[]);byMgr.get(p.managerId).push(p)});for(const arr of byMgr.values())arr.sort(compareSiblings);
  const visited=new Set();
  function collect(id,depth,path=new Set()){let out=[];for(const p of byMgr.get(id)||[]){if(path.has(p.id)||visited.has(p.id))continue;visited.add(p.id);const next=new Set(path);next.add(p.id);const kids=collect(p.id,depth+(baseVisible(p)?1:0),next);if(baseVisible(p))out.push({...p,depth,children:kids});else out.push(...kids)}return out}
  let roots=collect('',0);
  const orphaned=people.filter(p=>!visited.has(p.id)&&baseVisible(p));orphaned.forEach(p=>roots.push({...p,depth:0,children:[]}));
  return roots;
}
function applyDepthAndCollapse(nodes,depth=0){return nodes.map(n=>({...n,children:(depth+1<maxDepth&&!collapsed.has(n.id))?applyDepthAndCollapse(n.children,depth+1):[]}))}
function flatten(nodes,out=[]){for(const n of nodes){out.push(n);flatten(n.children,out)}return out}
function badge(type,status){const dark=document.documentElement.dataset.theme==='dark';const fills=dark?{Head:cssVar('--accent-soft'),'Team Leader':'#123a2a',Engineer:cssVar('--panel-3'),Specialist:'#1e3a5f',Graduate:'#3b2b19',Intern:'#3d2034'}:{Head:cssVar('--accent-soft'),'Team Leader':'#ecfdf3',Engineer:cssVar('--panel-3'),Specialist:'#eff6ff',Graduate:'#fff7ed',Intern:'#fdf2fa'};const inks=dark?{Head:cssVar('--accent-ink'),'Team Leader':'#86efac',Engineer:cssVar('--muted'),Specialist:'#93c5fd',Graduate:'#fdba74',Intern:'#f9a8d4'}:{Head:cssVar('--accent-ink'),'Team Leader':'#027a48',Engineer:cssVar('--muted'),Specialist:'#1d4ed8',Graduate:'#b54708',Intern:'#c11574'};const sf=status==='Approved'?(dark?'#123a2a':'#dcfae6'):(dark?'#412421':'#fee4e2');const si=status==='Approved'?(dark?'#86efac':'#067647'):(dark?'#ff8c83':'#b42318');return[fills[type]||fills.Engineer,inks[type]||inks.Engineer,sf,si]}
function descendantsOf(id){const out=new Set();let changed=true;while(changed){changed=false;people.forEach(p=>{if((p.managerId===id||out.has(p.managerId))&&!out.has(p.id)){out.add(p.id);changed=true}})}return out}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1200)}
function pruneToGroup(nodes,group){function rec(n){const kids=n.children.map(rec).filter(Boolean);if(n.group===group||kids.length)return{...n,children:kids};return null}return nodes.map(rec).filter(Boolean)}
/* Export artwork is self-contained: logo pixels are embedded in each PNG. */
function exportText(text,max){const s=String(text||'');return s.length>max?s.slice(0,max-1)+'…':s}
async function pngFromExport(art){
  const scale=Math.min(2,16384/art.width,16384/art.height,Math.sqrt(24000000/(art.width*art.height)));
  if(scale<.25)throw new Error('Chart is too large for a readable PNG. Use per-group export or reduce the visible levels.');
  const image=await readImage(new Blob([art.xml],{type:'image/svg+xml'})),canvas=document.createElement('canvas');canvas.width=Math.ceil(art.width*scale);canvas.height=Math.ceil(art.height*scale);
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PNG export is not supported by this browser.');ctx.scale(scale,scale);ctx.drawImage(image,0,0);
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG generation failed.')),'image/png'));
}
async function exportCurrentPNG(filename='org-chart.png',filterGroup=null){
  try{const art=buildExportSVG(filterGroup);if(!art){toast('Nothing to export');return false}const blob=await pngFromExport(art);downloadBlob(blob,filename);toast('Chart exported as PNG');return true}
  catch(error){toast(error.message||'PNG export failed');return false}
}
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=CRC_TABLE[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0}
function makeZip(files){
  // Store already-compressed PNGs without a third-party ZIP dependency.
  const encoder=new TextEncoder(),chunks=[],directory=[];let offset=0,directorySize=0;
  const now=new Date(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),date=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  for(const file of files){const name=encoder.encode(file.name),data=file.data,crc=crc32(data),local=new Uint8Array(30),lh=new DataView(local.buffer);
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(10,time,true);lh.setUint16(12,date,true);lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,name.length,true);
    chunks.push(local,name,data);const central=new Uint8Array(46),ch=new DataView(central.buffer);ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(12,time,true);ch.setUint16(14,date,true);ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,name.length,true);ch.setUint32(42,offset,true);directory.push(central,name);offset+=30+name.length+data.length;directorySize+=46+name.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,directorySize,true);e.setUint32(16,offset,true);
  return new Blob([...chunks,...directory,end],{type:'application/zip'});
}
function makeJpegPdf(pages,mediaW=842,mediaH=595){
  const encoder=new TextEncoder(),chunks=[],offsets=[0];let pos=0;
  const write=bytes=>{if(typeof bytes==='string')bytes=encoder.encode(bytes);chunks.push(bytes);pos+=bytes.length};
  write('%PDF-1.4\n%\x80\x81\x82\x83\n');
  const obj=(id,dict,stream)=>{offsets[id]=pos;write(`${id} 0 obj\n${dict}`);if(stream){write('stream\n');write(stream);write('\nendstream\n');}write('endobj\n');};
  const kids=[];
  pages.forEach((page,i)=>{
    const pageId=3+i*3,contentId=pageId+1,imgId=pageId+2;kids.push(`${pageId} 0 R`);
    const maxW=mediaW-72,maxH=mediaH-72;const k=Math.min(maxW/page.width,maxH/page.height);const w=page.width*k,h=page.height*k;const x=(mediaW-w)/2,y=(mediaH-h)/2;
    const content=`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    const contentBytes=encoder.encode(content);
    obj(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${mediaW} ${mediaH}] /Contents ${contentId} 0 R /Resources << /XObject << /Im0 ${imgId} 0 R >> >> >>\n`);
    obj(contentId,`<< /Length ${contentBytes.length} >>\n`,contentBytes);
    obj(imgId,`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\n`,page.jpeg);
  });
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>\n');
  obj(2,`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>\n`);
  const xref=pos;write(`xref\n0 ${offsets.length}\n`);write('0000000000 65535 f \n');
  for(let i=1;i<offsets.length;i++)write(String(offsets[i]||0).padStart(10,'0')+' 00000 n \n');
  write(`trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks,{type:'application/pdf'});
}
async function jpegFromArt(art){
  const blob=await pngFromExport(art),image=await readImage(blob);
  const max=1800,scale=Math.min(1,max/image.naturalWidth,max/image.naturalHeight);
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF export is not supported by this browser.');
  ctx.fillStyle=cssVar('--bg')||'#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const jpeg=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('JPEG generation failed.')),'image/jpeg',0.86));
  return {jpeg:new Uint8Array(await jpeg.arrayBuffer()),width:canvas.width,height:canvas.height};
}
function buildCoverSVG(){
  const s=activeScenario(),t=totals(s),bg=cssVar('--bg'),panel=cssVar('--panel'),ink=cssVar('--ink'),muted=cssVar('--muted'),line=cssVar('--line'),accent=cssVar('--accent-ink');
  const w=1100,h=620,xml=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${bg}"/>`];
  let titleX=48;const logo=branding.includeExports?logoForTheme(branding):null;
  if(logo){const k=Math.min(120/logo.width,40/logo.height),lw=logo.width*k,lh=logo.height*k,surface=logo.surface==='light'?'#fff':logo.surface==='dark'?'#151515':null;if(surface)xml.push(`<rect x="42" y="36" width="${lw+12}" height="52" rx="6" fill="${surface}"/>`);xml.push(`<image x="48" y="${42+(40-lh)/2}" width="${lw}" height="${lh}" xlink:href="${esc(logo.data)}"/>`);titleX=lw+70;}
  xml.push(`<text x="${titleX}" y="58" fill="${ink}" style="font:700 18px Arial,sans-serif">${esc(exportText(branding.companyName||'OrgFlow',70))}</text>`);
  xml.push(`<text x="48" y="140" fill="${ink}" style="font:800 36px Arial,sans-serif">Board pack</text>`);
  xml.push(`<text x="48" y="176" fill="${accent}" style="font:600 16px Arial,sans-serif">${esc(exportText((branding.chartTitle||'Organization')+' · '+s.name,90))}</text>`);
  xml.push(`<text x="48" y="206" fill="${muted}" style="font:500 13px Arial,sans-serif">${esc(today)} · ${t.positions} positions · ${fteText(t.approvedFte)} approved FTE · private local snapshot</text>`);
  [['positions','Positions',t.positions],['filled','Filled',t.filled],['open','Open',t.open],['approvedFte','Approved FTE',fteText(t.approvedFte)]].forEach(([_,label,value],i)=>{
    const x=48+i*256;xml.push(`<rect x="${x}" y="250" width="240" height="110" rx="12" fill="${panel}" stroke="${line}"/><text x="${x+18}" y="278" fill="${muted}" style="font:700 11px Arial,sans-serif">${label.toUpperCase()}</text><text x="${x+18}" y="324" fill="${ink}" style="font:800 32px Arial,sans-serif">${esc(String(value))}</text>`);
  });
  xml.push(`<text x="48" y="430" fill="${muted}" style="font:500 13px Arial,sans-serif;width:900px">Following pages: current org chart, then scenario comparison when more than one scenario exists.</text>`);
  xml.push(`<text x="48" y="${h-36}" fill="${muted}" style="font:500 11px Arial,sans-serif">${esc(exportText(branding.footer||'Confidential · generated in-browser by OrgFlow',120))}</text></svg>`);
  return {xml:xml.join(''),width:w,height:h,nodeCount:1};
}
async function exportBoardPack(){
  try{
    toast('Preparing board pack…');
    const pages=[await jpegFromArt(buildCoverSVG())];
    const chart=buildExportSVG();if(chart)pages.push(await jpegFromArt(chart));
    if(workspace.scenarios.length>1)pages.push(await jpegFromArt(buildComparisonSVG()));
    downloadBlob(makeJpegPdf(pages),`orgflow-board-pack-${today}.pdf`);toast('Board pack exported as PDF');
  }catch(error){toast(error.message||'PDF export failed');}
}
const SNAPSHOT_CSS=`body{margin:0;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;background:#f3f5f9;color:#0f172a}main{max-width:1100px;margin:0 auto;padding:28px 20px}h1{font-size:28px;letter-spacing:-.03em;margin:0 0 8px}p{color:#475569}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0}.metric{border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff}.metric b{display:block;font-size:22px}.chart{overflow:auto;border:1px solid #e2e8f0;border-radius:16px;background:#fff;padding:16px}pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:14px;border-radius:12px;font-size:11px}`;
async function exportShareableHTML(){
  try{
    const art=buildExportSVG();if(!art){toast('Nothing to export');return;}
    const html=chartOnlyHTML(art,activeScenario().name);
    downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),`orgflow-${slug(activeScenario().name)}-snapshot.html`);toast('Chart-only HTML exported. Hidden workspace records are not included.');
  }catch(error){toast(error.message||'HTML export failed');}
}
function chartOnlyHTML(art,scenarioName){
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(scenarioName)} — OrgFlow chart</title><style>${SNAPSHOT_CSS}</style></head><body><main class="snapshot"><h1>${esc(scenarioName)}</h1><p>Chart-only presentation · ${esc(today)} · ${esc($('#datePill').textContent)}. Contains visible chart content and context cards only. Not a restorable workspace backup.</p><div class="chart">${art.xml.replace(/<title>[\s\S]*?<\/title>/g,'')}</div></main></body></html>`;
}
const SHARE_FIELD_DEFS=[['personName','Person names',true],['employeeNumber','Employee numbers',false],['photo','Photos',false],['group','Group / team',true],['location','Location / site',true],['status','Approval',true],['hiringState','Hiring state',true],['fte','FTE',true],['dates','Start & end dates',false],['costCenter','Cost center',false],['jobFamily','Job family',false]];
function openShareDialog(){
  const s=activeScenario();
  const rows=[];
  const walk=(id,d)=>{const p=s.positions.find(x=>x.id===id);if(!p)return;rows.push({id:p.id,title:p.title,d});s.positions.filter(c=>c.managerId===id).forEach(c=>walk(c.id,d+1));};
  s.positions.filter(p=>!p.managerId||!s.positions.some(x=>x.id===p.managerId)).forEach(p=>walk(p.id,0));
  $('#shareScope').innerHTML=`<option value="">Whole organization · ${s.name}</option>`+rows.map(r=>`<option value="${esc(r.id)}">${'— '.repeat(r.d)}${esc(r.title)}</option>`).join('');
  $('#shareFields').innerHTML=SHARE_FIELD_DEFS.map(([key,label,on])=>`<label class="check stack-check"><input type="checkbox" data-share-field="${key}" ${on?'checked':''}/> ${esc(label)}</label>`).join('');
  openDialog('shareModal');
}
async function exportInteractiveChart(){
  const rootId=$('#shareScope').value||'';
  const include={};
  $$('#shareFields input[data-share-field]').forEach(cb=>{
    const k=cb.dataset.shareField;
    if(k==='dates'){include.startDate=cb.checked;include.endDate=cb.checked;}
    else include[k]=cb.checked;
  });
  try{
    const dataset=buildShareDataset(workspace,{scenarioId:workspace.activeScenarioId,rootId,include,initialDepth:+$('#shareDepth').value,companyName:branding.companyName,chartTitle:branding.chartTitle});
    if(!dataset.positions.length){toast('Nothing to export in that scope.');return;}
    const [managementRes,coreRes,viewerRes]=await Promise.all([fetch('js/management-core.js'),fetch('js/orgflow-core.js'),fetch('js/share-viewer.js')]);
    if(!managementRes.ok||!coreRes.ok||!viewerRes.ok)throw new Error('The viewer assets could not be loaded — interactive export needs the hosted or desktop app.');
    const staticSvg=OrgFlowShare.shareStaticSvg(dataset);
    const html=OrgFlowShare.buildShareHtml(dataset,{managementSrc:await managementRes.text(),coreSrc:await coreRes.text(),viewerSrc:await viewerRes.text(),staticSvg});
    const name=rootId?slug(dataset.scope.rootTitle):slug(dataset.scenario.name);
    downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),`orgflow-${name}-interactive.html`);
    closeDialog('shareModal');
    toast(`Interactive chart exported — ${dataset.positions.length} positions, ${dataset.fields.length} fields included`);
  }catch(error){toast(error.message||'Interactive export failed');}
}
let exportingGroupPack=false;
async function exportGroups(){
  if(exportingGroupPack)return;const groups=[...new Set(flatten(buildFilteredForest(),[]).map(p=>p.group).filter(Boolean))].sort();
  if(!groups.length){toast('No groups to export');return 0}
  exportingGroupPack=true;
  try{const jobs=groups.map((group,i)=>({group,name:`${String(i+1).padStart(2,'0')}-org-${slug(group)}.png`,art:buildExportSVG(group)})).filter(j=>j.art),files=[];
    for(const job of jobs){toast(`Preparing group ${files.length+1} of ${jobs.length}…`);const blob=await pngFromExport(job.art);files.push({name:job.name,data:new Uint8Array(await blob.arrayBuffer())})}
    downloadBlob(makeZip(files),'orgflow-groups.zip');toast(`Exported ${files.length} group charts in one ZIP`);return files.length;
  }catch(error){toast(error.message||'Group export failed. No incomplete archive was downloaded.');return 0}
  finally{exportingGroupPack=false}
}

function centerChart(){wrap.scrollTo({left:Math.max(0,(svg.clientWidth-wrap.clientWidth)/2),top:0,behavior:'smooth'})}
function closeMenus(){ $('#exportMenu').classList.remove('open');$('#paletteMenu').classList.remove('open') }
function triggerImport(){$('#fileInput').value='';$('#fileInput').click()}

/* Company identity. Uploaded artwork never enters the document as live SVG. */
const BRANDING_KEY='orgflow.branding.v1';
const BRANDING_DEFAULTS={companyName:'',chartTitle:'Organization',logo:null,darkLogo:null,includeExports:true,footer:''};
const LOGO_SURFACES=['auto','light','dark','transparent'];
const MAX_LOGO_BYTES=2*1024*1024;
const defaultLogoMarkup=$('#companyLogo').innerHTML;
let branding=loadBranding(),brandingDraft=null,logoBusy=0,brandingSession=0;
function validStoredLogo(v){
  return v&&typeof v.data==='string'&&v.data.length<1500000&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.data)
    &&Number.isFinite(v.width)&&v.width>0&&v.width<=2048&&Number.isFinite(v.height)&&v.height>0&&v.height<=2048;
}
function cleanBranding(v){
  if(!v||typeof v!=='object')return structuredClone(BRANDING_DEFAULTS);
  const cleanLogo=x=>validStoredLogo(x)?{data:x.data,name:String(x.name||'Company logo').slice(0,120),width:x.width,height:x.height,surface:LOGO_SURFACES.includes(x.surface)?x.surface:'auto'}:null;
  return {companyName:String(v.companyName||'').slice(0,80),chartTitle:String(v.chartTitle||'Organization').slice(0,100),logo:cleanLogo(v.logo),darkLogo:cleanLogo(v.darkLogo),includeExports:v.includeExports!==false,footer:String(v.footer||'').slice(0,100)};
}
function loadBranding(){try{return cleanBranding(JSON.parse(appStorage.getItem(BRANDING_KEY)||'null'))}catch{return structuredClone(BRANDING_DEFAULTS)}}
function logoForTheme(b,theme=document.documentElement.dataset.theme){return theme==='dark'?(b.darkLogo||b.logo):(b.logo||b.darkLogo)}
function applyBranding(){
  const logo=logoForTheme(branding),el=$('#companyLogo');
  el.replaceChildren();el.classList.toggle('company-logo',!!logo);el.removeAttribute('data-surface');
  if(logo){const img=document.createElement('img');img.src=logo.data;img.alt=branding.companyName?`${branding.companyName} logo`:'Company logo';el.dataset.surface=logo.surface;el.append(img)}
  else {el.innerHTML=defaultLogoMarkup;el.setAttribute('aria-hidden','true')}
  if(logo)el.removeAttribute('aria-hidden');
  $('#brandName').textContent=branding.companyName||'OrgFlow';$('#brandName').title=branding.companyName||'OrgFlow';
  $('#brandSubline').textContent=branding.companyName?'OrgFlow · Organization map':'Interactive organization map';
  $('#chartTitle').textContent=branding.chartTitle;$('#chartTitle').title=branding.chartTitle;
  document.title=`${branding.companyName?branding.companyName+' · ':''}${branding.chartTitle} — OrgFlow`;
}
function brandingError(message){const el=$('#brandingError');el.textContent=message;el.classList.toggle('show',!!message);if(message)el.scrollIntoView({block:'nearest'})}
function openBranding(){
  closeMenus();if(drawerIsDirty()&&!confirm('Discard unsaved position edits?'))return;hidePositionEditor();brandingSession++;brandingDraft=structuredClone(branding);logoBusy=0;
  $('#brandCompany').value=branding.companyName;$('#brandChartTitle').value=branding.chartTitle;
  $('#brandExports').checked=branding.includeExports;$('#brandFooter').value=branding.footer;
  brandingError('');$('#brandingModal').classList.add('open');renderBrandingPreview();$('#brandCompany').focus();
}
function closeBranding(){brandingSession++;brandingDraft=null;logoBusy=0;$('#brandingModal').classList.remove('open');$('#brandingBtn').focus()}
function renderBrandingPreview(){
  if(!brandingDraft)return;
  for(const slot of ['primary','dark']){
    const own=slot==='primary'?brandingDraft.logo:brandingDraft.darkLogo;
    const effective=own||(slot==='dark'?brandingDraft.logo:brandingDraft.darkLogo),host=$(`#${slot}Preview`);host.replaceChildren();
    host.dataset.surface=effective?.surface||'auto';
    if(effective){const img=document.createElement('img');img.src=effective.data;img.alt=`${slot==='dark'?'Dark':'Light'}-mode logo preview`;host.append(img)}
    else{const empty=document.createElement('span');empty.className='placeholder-logo';empty.textContent=slot==='dark'?'Dark-mode preview':'Drop your company logo here';host.append(empty)}
    $(`#${slot}File`).textContent=own?`${own.name} · ${own.width} × ${own.height}`:(effective?'Uses '+(slot==='dark'?'primary':'dark-mode')+' logo':slot==='dark'?'Uses primary logo when empty':'No logo uploaded');
    $(`#${slot}Surface`).value=own?.surface||'auto';$(`#${slot}Surface`).disabled=!own||logoBusy>0;
    $(`#remove${slot==='dark'?'Dark':'Primary'}`).disabled=!own||logoBusy>0;
  }
  $('#brandingSave').disabled=logoBusy>0;$('#brandingSave').textContent=logoBusy?'Processing logo…':'Save branding';
  $('#uploadPrimary').disabled=$('#uploadDark').disabled=logoBusy>0;
}
function readImage(blob){
  return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();let done=false;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);URL.revokeObjectURL(url);error?reject(error):resolve(img)};
    const timer=setTimeout(()=>finish(new Error('The image could not be decoded. Try exporting it as PNG.')),8000);
    img.onload=()=>finish();img.onerror=()=>finish(new Error('This image could not be read. Export it as PNG, JPG, WebP or a static SVG.'));img.src=url;
  });
}
function safeSVG(text){
  // Reject executable/external content, then convert the approved vector to pixels.
  if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text))throw new Error('SVG document types and external stylesheets are not supported. Use a plain SVG or PNG.');
  const doc=new DOMParser().parseFromString(text,'image/svg+xml'),root=doc.documentElement;
  if(doc.querySelector('parsererror')||root.localName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg')throw new Error('Invalid SVG. Export the logo as a standard SVG or PNG.');
  const allowed=new Set(['svg','g','path','circle','ellipse','rect','line','polyline','polygon','text','tspan','defs','linearGradient','radialGradient','stop','clipPath','mask','pattern','symbol','use','title','desc','style']);
  const elements=[root,...root.querySelectorAll('*')];if(elements.length>12000)throw new Error('This SVG is too complex. Export it as PNG.');
  function checkCSS(value){
    if(/[\\@]/.test(value)||/javascript\s*:|expression\s*\(|-moz-binding/i.test(value))throw new Error('SVG with active or external styling is not supported. Use a static PNG.');
    const stripped=value.replace(/url\(\s*(['"]?)#[a-zA-Z0-9_.:-]+\1\s*\)/gi,'');
    if(/url\s*\(/i.test(stripped))throw new Error('External SVG resources are not supported. Embed the artwork or use PNG.');
  }
  for(const el of elements){
    if(el.namespaceURI!=='http://www.w3.org/2000/svg'||!allowed.has(el.localName))throw new Error('Only static SVG artwork is supported. Remove scripts, embedded images or animation, or use PNG.');
    for(const attr of [...el.attributes]){
      const name=attr.name.toLowerCase(),value=attr.value;
      if(name.startsWith('on')||name==='xml:base')throw new Error('SVG event handlers and external references are not supported.');
      if(attr.localName==='href'&&!/^#[a-zA-Z0-9_.:-]+$/.test(value))throw new Error('External SVG links are not supported. Use a self-contained logo or PNG.');
      if(name==='style'||/url\s*\(/i.test(value))checkCSS(value);
    }
    if(el.localName==='style')checkCSS(el.textContent);
  }
  let view=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number),w,h;
  if(view.length===4&&view.every(Number.isFinite)&&view[2]>0&&view[3]>0){w=view[2];h=view[3]}
  else {const read=x=>{const v=root.getAttribute(x)||'';return /^\d+(?:\.\d+)?(?:px)?$/.test(v)?parseFloat(v):0};w=read('width');h=read('height');if(!w||!h)throw new Error('SVG needs a valid viewBox or explicit pixel dimensions.');root.setAttribute('viewBox',`0 0 ${w} ${h}`)}
  if(w/h>100||h/w>100)throw new Error('This logo has an unusually narrow aspect ratio. Crop the artwork before uploading.');
  const scale=Math.min(1024/w,384/h);root.setAttribute('width',String(Math.max(1,Math.round(w*scale))));root.setAttribute('height',String(Math.max(1,Math.round(h*scale))));
  return new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml'});
}
async function normalizeLogoFile(file){
  if(!file||file.size===0)throw new Error('Choose a non-empty logo image.');
  if(file.size>MAX_LOGO_BYTES)throw new Error('Logo is too large. Choose an image smaller than 2 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());let blob;
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71){
    if(bytes.length<24)throw new Error('Invalid PNG file.');const v=new DataView(bytes.buffer),w=v.getUint32(16),h=v.getUint32(20);if(w*h>32000000||w>16384||h>16384)throw new Error('Image dimensions are too large. Resize the logo first.');
    blob=new Blob([bytes],{type:'image/png'});
  }else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)blob=new Blob([bytes],{type:'image/jpeg'});
  else if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')blob=new Blob([bytes],{type:'image/webp'});
  else {const text=new TextDecoder().decode(bytes);if(!/<svg[\s>]/i.test(text))throw new Error('Unsupported format. Choose PNG, JPG, WebP or a static SVG.');blob=safeSVG(text)}
  const image=await readImage(blob),w=image.naturalWidth,h=image.naturalHeight;
  if(!w||!h||w*h>32000000||w>16384||h>16384)throw new Error('Invalid or oversized image dimensions. Resize the logo first.');
  let scale=Math.min(1,1024/w,384/h),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser cannot process this image.');ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,canvas.width,canvas.height);
  let data=canvas.toDataURL('image/png');
  if(data.length>=1500000)throw new Error('The optimized logo is still too large. Use simpler artwork or a smaller image.');
  return {data,name:String(file.name||'Company logo').slice(0,120),width:canvas.width,height:canvas.height,surface:'auto'};
}
async function uploadLogo(file,slot){
  if(!brandingDraft||logoBusy)return;const session=brandingSession;logoBusy++;brandingError('');renderBrandingPreview();
  try{const result=await normalizeLogoFile(file);if(!brandingDraft||session!==brandingSession)return;const key=slot==='dark'?'darkLogo':'logo';result.surface=brandingDraft[key]?.surface||'auto';brandingDraft[key]=result}
  catch(error){if(session===brandingSession)brandingError(error.message||'Could not import this logo.')}
  finally{if(session===brandingSession){logoBusy--;renderBrandingPreview()}}
}
function saveBranding(){
  if(!brandingDraft||logoBusy)return;const title=$('#brandChartTitle').value.trim();if(!title){brandingError('Enter a chart title.');$('#brandChartTitle').focus();return}
  const candidate={...brandingDraft,companyName:$('#brandCompany').value.trim(),chartTitle:title,includeExports:$('#brandExports').checked,footer:$('#brandFooter').value.trim()};
  safePreference(BRANDING_KEY,JSON.stringify(candidate));
  branding=candidate;writeDurable(workspace);applyBranding();closeBranding();toast('Company branding saved');afterWorkspaceMutation();
}
const PLANNING_KEY = 'orgflow.planning.v2';
const HISTORY_KEY = 'orgflow.history.v1';
const WELCOME_KEY = 'orgflow.welcome.v1';
const AUTOSAVE_KEY = 'orgflow.autosaveFile';
let workspace = null;
let modelLoadError = '';
let lastSavedPlanningText = null;
let undoStack = [];
let redoStack = [];
let skipNodeClick = false;
let photoDraft = null;
let welcomeFirstRun = false;
let currentView = 'chart';
let activeHiring = new Set(HIRING_STATES);
let compareBaselineId = 'current';
let compareTargetId = '';
let compareKind = 'all';
let selectedSourceScenario = '';
let scenarioDialogMode = 'create';
let lastDialogFocus = null;
let savedViewTimer = null;
let showChartChanges = true;

function activeScenario(){return workspace.scenarios.find(s=>s.id===workspace.activeScenarioId);}
function scenarioById(id){return workspace.scenarios.find(s=>s.id===id);}
function projection(scenario=activeScenario()){const date=($('#dateFilter')?.checked&&$('#asOf')?.value)||today;return projectScenario({...scenario,positions:OrgFlowManagement.effectivePositions(scenario,date)});}
let projectionSource=null,projectionDate='';
function syncProjection(){const source=activeScenario(),date=($('#dateFilter')?.checked&&$('#asOf')?.value)||today;if(source!==projectionSource||date!==projectionDate){people=projection(source);projectionSource=source;projectionDate=date;}}
// Copies of the workspace can live in appStorage, IndexedDB and (on the
// desktop build) the main-process journal. On startup the newest revision
// wins so an eviction or a failed write in one area cannot lose newer work.
async function readDurableCopies(){
  const copies=[];
  const local=safeGet(PLANNING_KEY);
  if(local)copies.push({source:'browser storage',text:local,branding:loadBranding(),theme:safeGet('orgflow.theme')||'',palette:safeGet('orgflow.palette')||''});
  try{
    const row=await OrgFlowStore.readDocument();
    if(row?.planning)copies.push({source:'app storage',text:JSON.stringify(row.planning),branding:row.branding||null,theme:row.theme||'',palette:row.palette||'',view:row.view,authoritative:true});
  }catch{}
  if(window.orgflowDesktop?.loadWorkspace){
    try{
      const journaled=await window.orgflowDesktop.loadWorkspace();
      if(journaled)copies.push({source:'desktop file',text:journaled,authoritative:true});
    }catch{}
  }
  return copies;
}
function newestCopy(copies){
  let best=null;
  for(const copy of copies){
    let parsed=null;
    try{parsed=JSON.parse(copy.text);}catch{continue;}
    // Durable copies may be a full workspace envelope or bare planning data.
    const raw=parsed?.format==='orgflow.workspace'?parsed.planning:parsed;
    if(parsed?.format==='orgflow.workspace'){copy.branding=copy.branding||parsed.branding||null;copy.theme=copy.theme||parsed.theme||'';copy.palette=copy.palette||parsed.palette||'';copy.view=parsed.view||copy.view;}
    let planning=null;
    try{planning=validatePlanning(raw);}catch(error){
      if(error?.code==='SCHEMA_TOO_NEW'){copy.schemaTooNew=true;copy.planning=raw;}
      continue;
    }
    copy.planning=planning;
    if(!best||copy.authoritative&&!best.authoritative||copy.authoritative===best.authoritative&&compareWorkspaceStamps(planning,best.planning)>0)best=copy;
  }
  // Any newer-schema copy blocks editing outright: this build cannot read it,
  // and a save here would write the older schema over it in every store.
  const tooNew=copies.find(c=>c.schemaTooNew);
  if(tooNew)return tooNew;
  return best;
}
async function initPlanning(){
  try {
    const copies=await readDurableCopies();
    const pick=newestCopy(copies);
    if(pick?.schemaTooNew)throw Object.assign(new Error(`This workspace was written by a newer OrgFlow. Update the app before editing — saving here would drop fields it does not understand.`),{code:'SCHEMA_TOO_NEW'});
    if(pick){
      workspace=pick.planning;lastSavedPlanningText=JSON.stringify(workspace);
      // The durable envelope carries the workspace chrome so a restored copy
      // looks like the workspace that was saved — not a fresh install.
      if(pick.branding){branding=cleanBranding(pick.branding);try{appStorage.setItem(BRANDING_KEY,JSON.stringify(branding));}catch{}}
      if(pick.view)safePreference('orgflow.planning.view.v2',JSON.stringify(pick.view));
      if(pick.theme){try{appStorage.setItem('orgflow.theme',pick.theme);}catch{}}
      if(pick.palette){try{appStorage.setItem('orgflow.palette',pick.palette);}catch{}}
      if(pick.source!=='browser storage'){
        try{appStorage.setItem(PLANNING_KEY,lastSavedPlanningText);}catch{}
        toast(`Workspace restored from ${pick.source} — it was ahead of the copy in browser storage.`);
      }
    }
    else {
      if(copies.length)throw new Error('Saved workspace copies could not be read. Open a valid backup or use Recovery & backups; existing data was preserved.');
      const old=appStorage.getItem('orgflow.people');
      if(old!==null) workspace=validatePlanning(migrateLegacy(JSON.parse(old)));
      else workspace=validatePlanning(ORGFLOW_EXAMPLES['harbor-and-co'].planning);
      workspace=touchWorkspace(workspace);
      lastSavedPlanningText=JSON.stringify(workspace);safePreference(PLANNING_KEY,lastSavedPlanningText);
      if(old===null) applySampleChrome('harbor-and-co', true);
      writeDurable(workspace,lastSavedPlanningText);
    }
  }catch(error){
    modelLoadError=error.message||'Browser storage is unavailable.';
    // Never replace unreadable saved data with the demo automatically.
    if(!workspace)workspace=emptyWorkspace(today);
  }
  syncProjection();
}
function updateUndoButtons(){
  const undo=$('#undoBtn'),redo=$('#redoBtn');
  if(undo)undo.disabled=!undoStack.length;
  if(redo)redo.disabled=!redoStack.length;
}
function stripPlanningMedia(planning){
  const copy=structuredClone(planning);
  for(const s of copy.scenarios||[]){
    for(const e of s.employees||[])e.photo=null;
    for(const field of ['baseSnapshot','applicationBaseline','appliedBefore','appliedAfter'])for(const e of s[field]?.employees||[])e.photo=null;
  }
  return copy;
}
function persistLocalHistory(planningText,note){
  try{
    let list=JSON.parse(appStorage.getItem(HISTORY_KEY)||'[]');
    if(!Array.isArray(list))list=[];
    list.unshift({at:new Date().toISOString(),note:String(note||'Saved').slice(0,80),planning:stripPlanningMedia(JSON.parse(planningText))});
    list=list.slice(0,10);
    while(list.length){
      try{appStorage.setItem(HISTORY_KEY,JSON.stringify(list));break;}
      catch{list.pop();}
    }
  }catch{}
}
function applyPlanningSnapshot(text,message){
  if(enterpriseBlocksWrite())throw new Error('You cannot edit this organization.');
  assertCacheCurrent();
  const checked=validatePlanning(touchWorkspace(JSON.parse(text)));
  for(const previous of workspace.scenarios){
    const target=checked.scenarios.find(s=>s.id===previous.id);
    if(previous.workflow?.state==='Applied'&&(!target||!OrgFlowManagement.same(previous,target)))throw new Error('Undo cannot cross an applied decision. Create a rollback proposal instead.');
    if(target){target.workflow=structuredClone(previous.workflow);for(const key of ['baseSnapshot','applicationBaseline','appliedBefore','appliedAfter'])target[key]=structuredClone(previous[key]);if(!window.OrgFlowEnterprise?.enabled)OrgFlowManagement.invalidateDecision(previous,target,{actor:'Local planner',now:new Date().toISOString()});}
  }
  const serialized=JSON.stringify(checked);
  safePreference(PLANNING_KEY,serialized);
  writeDurable(checked,serialized);
  lastSavedPlanningText=serialized;workspace=checked;modelLoadError='';$('#loadError').classList.add('hidden');
  syncProjection();hidePositionEditor();render();updateUndoButtons();if(message)toast(message);afterWorkspaceMutation();
}
function undoChange(){
  if(!undoStack.length||enterpriseBlocksWrite())return;
  if(drawerIsDirty()&&!confirm('Discard unsaved position edits before Undo?'))return;
  const previous=lastSavedPlanningText, target=undoStack.at(-1);
  try{applyPlanningSnapshot(target,'Undone');undoStack.pop();redoStack.push(previous);updateUndoButtons();}
  catch(error){toast(error.message);}
}
function redoChange(){
  if(!redoStack.length||enterpriseBlocksWrite())return;
  if(drawerIsDirty()&&!confirm('Discard unsaved position edits before Redo?'))return;
  const previous=lastSavedPlanningText, target=redoStack.at(-1);
  try{applyPlanningSnapshot(target,'Redone');redoStack.pop();undoStack.push(previous);updateUndoButtons();}
  catch(error){toast(error.message);}
}
function recordUndoFrom(previousText,note){
  if(!previousText||previousText===lastSavedPlanningText)return;
  undoStack.push(previousText);
  if(undoStack.length>50)undoStack.shift();
  redoStack=[];
  persistLocalHistory(previousText,note);
  updateUndoButtons();
}
let workspaceIOBusy=false;
function enterpriseBlocksWrite(){if(workspaceIOBusy)return true;
  const e=window.OrgFlowEnterprise;if(!e)return false;
  // Writes stay blocked while the host is still applying the server document,
  // otherwise an edit can land in memory while queueSave() is still a no-op.
  if(e.applying)return true;
  return Boolean(e.enabled && (!e.canWrite || e.busy || e.saveState==='Conflict'));
}
function afterEnterprisePersist(){
  if(window.OrgFlowEnterprise?.queueSave) window.OrgFlowEnterprise.queueSave();
}
async function allowEnterpriseExport(kind){
  if(!window.OrgFlowEnterprise?.enabled) return true;
  return window.OrgFlowEnterprise.recordExport(kind);
}
// Every durable copy of the workspace is written through the same path so no
// store can quietly fall behind. appStorage remains the synchronous check
// against another tab; IndexedDB catches up async; the desktop journal writes
// through synchronously so a quit after commit still has the file.
let durableWrites=0, durableError='';
function assertCacheCurrent(){
  const cached=safeGet(PLANNING_KEY);
  // Cache is optional; the authoritative IndexedDB transaction also performs CAS.
  if(cached&&cached!==lastSavedPlanningText)throw new Error('Another tab changed this workspace. Reload before editing.');
}
function writeDurable(planning,serialized,options={}){
  const doc={...workspacePayload(),planning};
  const enterprise=window.OrgFlowEnterprise;
  const pending=enterprise?.enabled&&enterprise.canWrite&&!enterprise.applying
    ?{planning,payload:doc,baseVersion:enterprise.version,reason:'queued'}:null;
  if(window.orgflowDesktop?.saveWorkspace){
    try{const result=window.orgflowDesktop.saveWorkspace(JSON.stringify(doc));desktopSaveError=result?.error||(!result?.wrote?'Desktop recovery copy could not be saved.':'');}
    catch(error){desktopSaveError=error.message||'Desktop recovery copy could not be saved.';}
  }
  durableWrites++;
  const saved=OrgFlowStore.writeDocument(doc,{...options,pending});
  saved.then(()=>{durableError='';},error=>{durableError=error.message;toast('Device save failed. Keep this window open and export a backup.');}).finally(()=>{durableWrites--;renderSaveStatus();});
  saved.catch(()=>{});return saved;
}
async function checkpointWorkspace(note){
  if(!workspace)return null;
  try{
    await OrgFlowStore.flush();
    return await OrgFlowStore.addCheckpoint(workspace,note,{branding,view:captureView(),theme:document.documentElement.dataset.theme,palette:document.documentElement.dataset.palette});
  }catch(error){throw new Error('Checkpoint failed; replacement was stopped. '+error.message);}
}
function commitPlanning(next,message='',opts={}){
  if(enterpriseBlocksWrite())throw new Error('You can view this organization but you cannot save changes.');
  if(modelLoadError)throw new Error('Saved workspace could not be loaded. Restore a backup or reopen in a browser with local storage before editing.');
  const checked=validatePlanning(touchWorkspace(next));
  if(!opts.governance && !window.OrgFlowEnterprise?.enabled)for(const scenario of checked.scenarios){const previous=workspace.scenarios.find(x=>x.id===scenario.id);if(previous)OrgFlowManagement.invalidateDecision(previous,scenario,{actor:'Local planner',now:new Date().toISOString()});}
  if(!opts.governance)for(const previous of workspace.scenarios)if(previous.workflow?.state==='Applied'&&!checked.scenarios.some(x=>x.id===previous.id))throw new Error('Archive applied scenarios instead of deleting their decision records.');
  const serialized=JSON.stringify(checked);assertCacheCurrent();safePreference(PLANNING_KEY,serialized);
  const previous=lastSavedPlanningText;
  lastSavedPlanningText=serialized;
  workspace=checked;syncProjection();
  writeDurable(checked,serialized);
  if(opts.recordUndo!==false&&!opts.viewOnly)recordUndoFrom(previous,opts.historyNote||message||'Edit');
  render();updateUndoButtons();if(message)toast(message);if(opts.viewOnly)scheduleFileAutosave();else afterWorkspaceMutation();return true;
}
const filePersistence = new OrgFlowPersistence.FilePersistence({
  readPayload: () => workspacePayload(), onState: renderSaveStatus
});
let lastViewText = '';
let desktopSaveError = '';
let documentOperationBusy = false;
function renderSaveStatus() {
  const el=$('#saveStatus'); if(!el)return;
  const state=filePersistence.state(),enterprise=window.OrgFlowEnterprise;
  const server=enterprise?.enabled;
  const serverText=durableError?`Device save failed: ${durableError}`:durableWrites?'Saving on this device…':server ? `Shared server · ${enterprise.saveState || 'Saved'}` : window.orgflowDesktop?(desktopSaveError?'Desktop recovery save failed':'Saved on this device'):'Saved in this browser';
  const fileText=state.linked ? `${state.target || 'Linked file'} · ${state.error?'Save failed':state.writing?'Saving…':state.dirty?'Unsaved file changes':'Saved'}` : '';
  el.textContent=[serverText,fileText].filter(Boolean).join(' | ');
  const compact=$('#saveStatusCompact');if(compact){compact.textContent=el.textContent;compact.title=el.textContent;}
  el.dataset.state=durableError||desktopSaveError||state.error||enterprise?.saveState==='Conflict'?'error':state.dirty?'dirty':'saved';
  el.title=durableError || desktopSaveError || state.error || (server?'Shared workspace. File backup is separate.':'Browser storage is not a backup. Save a workspace file for recovery.');
  const retry=$('#retrySave');if(retry)retry.hidden=!state.linked||!state.error;
  const unlink=$('#unlinkFile');if(unlink)unlink.hidden=!state.linked;
}
function syncAutosaveUi() {
  const cb=$('#autoSaveFile');if(!cb)return;
  if(workspaceFileHandle!==filePersistence.handle)filePersistence.setTarget(workspaceFileHandle);
  const allowed=!window.OrgFlowEnterprise?.enabled||window.OrgFlowEnterprise.canExport;
  const can=!!workspaceFileHandle?.createWritable&&allowed;
  let pref=false;try{pref=appStorage.getItem(AUTOSAVE_KEY)==='1';}catch{}
  cb.disabled=!can;cb.checked=can&&pref&&!fileHandleNeedsReconnect;
  if(filePersistence.enabled!==cb.checked)filePersistence.setEnabled(cb.checked);
  const rb=$('#reconnectFile');if(rb)rb.classList.toggle('hidden',!(workspaceFileHandle&&fileHandleNeedsReconnect));
  renderSaveStatus();
}
// The file handle survives restarts in IndexedDB; the permission does not.
// On relaunch we either resume silently (granted) or ask to reconnect.
async function resumeFileHandle(){
  if(!window.showSaveFilePicker)return;
  try{
    const row=await OrgFlowStore.getHandle();
    if(!row?.handle?.createWritable||row.workspaceId!==workspace?.workspaceId)return;
    workspaceFileHandle=row.handle;
    // Reopening must not overwrite edits made by another app while closed.
    fileHandleNeedsReconnect=true;
    toast(`Reconnect “${row.name||'Saved file'}” to resume file saving.`);
    syncAutosaveUi();
  }catch{}
}
async function reconnectSavedFile(){
  try{
    const handle=workspaceFileHandle||(await OrgFlowStore.getHandle())?.handle;
    if(!handle?.createWritable){toast('No saved file to reconnect.');return;}
    const perm=await handle.requestPermission({mode:'readwrite'});
    if(perm==='granted'){
      const disk=JSON.parse(await (await handle.getFile()).text());
      const planning=disk.planning||disk;
      if(planning.workspaceId!==workspace.workspaceId)throw new Error('This file belongs to another workspace. Use Open org chart or Save as.');
      if(JSON.stringify(planning)!==JSON.stringify(workspace)&&!confirm('The saved file differs from this workspace. Replace its contents with the current workspace? Choose Cancel and Open org chart to load the file instead.'))return;
      workspaceFileHandle=handle;fileHandleNeedsReconnect=false;syncAutosaveUi();
      toast('Saved file reconnected — auto-save can update it again.');scheduleFileAutosave();
    }else toast('Permission was not granted — the file stays disconnected.');
  }catch(error){toast(error.message||'Could not reconnect the saved file.');}
}
function scheduleFileAutosave() { filePersistence.changed(); }
function afterWorkspaceMutation() {
  afterEnterprisePersist();
  scheduleFileAutosave();
}
function unlinkWorkspaceFile() {
  filePersistence.setTarget(null);workspaceFileHandle=null;fileHandleNeedsReconnect=false;
  try{OrgFlowStore.clearHandle();}catch{}
  syncAutosaveUi();
  toast('File unlinked. Changes remain in this browser.');
}
function updateScenario(mutator,message=''){
  const next=structuredClone(workspace),scenario=next.scenarios.find(s=>s.id===next.activeScenarioId);
  mutator(scenario);scenario.updatedAt=new Date().toISOString();return commitPlanning(next,message);
}
function switchScenario(id){
  if(!scenarioById(id)||scenarioById(id).archived)return;
  if(drawerIsDirty()&&!confirm('Switch scenarios and discard unsaved position edits?')){renderPlanningHeader();return;}
  const next=structuredClone(workspace);next.activeScenarioId=id;
  try{commitPlanning(next,'',{viewOnly:true,recordUndo:false});hidePositionEditor();collapsed.clear();selectedIds.clear();resetBulkFields();compareTargetId=id==='current'?(workspace.scenarios.find(s=>s.id!=='current'&&!s.archived)?.id||'current'):id;render();centerChart();}
  catch(error){toast(error.message);renderPlanningHeader();}
}
function createScenario(name,sourceId,description=''){
  const id=makeId('scenario'),next=OrgFlowManagement.createProposal(workspace,{id,name,sourceId,owner:window.OrgFlowEnterprise?.session?.user?.email||'',rationale:description});
  next.scenarios.at(-1).description=description.trim();
  commitPlanning(next,`Created ${name.trim()}. Current is unchanged.`);compareTargetId=id;compareBaselineId='current';collapsed.clear();selectedIds.clear();render();return id;
}

function deleteScenario(id){
  if(id==='current')throw new Error('Current cannot be deleted.');
  const next=structuredClone(workspace);if(!next.scenarios.some(s=>s.id===id))throw new Error('Scenario not found.');next.scenarios=next.scenarios.filter(s=>s.id!==id);if(next.activeScenarioId===id)next.activeScenarioId='current';
  commitPlanning(next,'Scenario deleted. Current is unchanged.');compareTargetId='';compareBaselineId='current';render();
}
function toggleScenarioArchive(id,archive){
  if(id==='current'){toast('Current cannot be archived.');return;}
  const next=structuredClone(workspace),s=next.scenarios.find(x=>x.id===id);if(!s)return;
  s.archived=archive;
  if(archive&&next.activeScenarioId===id)next.activeScenarioId='current';
  if(archive&&compareBaselineId===id)compareBaselineId='current';
  if(archive&&compareTargetId===id)compareTargetId=workspace.scenarios.find(x=>x.id!=='current'&&x.id!==id&&!x.archived)?.id||'current';
  commitPlanning(next,archive?`Archived ${s.name} — restore it from Scenario details.`:`Restored ${s.name}`);
}

function hidePositionEditor(){
  drawerSession++;photoBusy=false;$('#saveBtn').disabled=false;
  const wasOpen=$('#drawer').classList.contains('open');$('#drawer').classList.remove('open');$('#drawer').inert=true;selectedId=null;drawerSnapshot=null;
  if(wasOpen && lastEditorFocus?.isConnected)lastEditorFocus.focus({preventScroll:true});
}
let lastEditorFocus=null,drawerSnapshot=null,drawerPersonSnapshot=null,drawerSession=0,photoBusy=false;
function drawerFormState(){
  return JSON.stringify({id:$('#fPositionId').value,title:$('#fTitle').value,type:$('#fType').value,status:$('#fStatus').value,group:$('#fGroup').value,fte:$('#fFte').value,location:$('#fLocation').value,costCenter:$('#fCostCenter').value,jobFamily:$('#fJobFamily').value,manager:$('#fManager').value,secondary:$('#fSecondary').value,start:$('#fStart').value,end:$('#fEnd').value,hiring:$('#fHiring').value,person:$('#fPerson').value,name:$('#fName').value,employeeNo:$('#fEmployeeNo').value,stacked:$('#fStacked').checked,photo:photoDraft||''});
}
function drawerIsDirty(){return $('#drawer').classList.contains('open')&&drawerSnapshot!==null&&drawerFormState()!==drawerSnapshot;}
function requestCloseDrawer(){if(drawerIsDirty()&&!confirm('Discard unsaved position edits?'))return;hidePositionEditor();}
function openDrawer(id,newPosition=false){
  if(modelLoadError){toast('Restore your workspace before editing.');return;}
  if(drawerIsDirty()&&!confirm('Discard unsaved position edits?'))return;
  drawerSession++;photoBusy=false;$('#saveBtn').disabled=false;
  lastEditorFocus=document.activeElement;selectedId=newPosition?null:id;selectedSourceScenario=workspace.activeScenarioId;
  const p=activeScenario().positions.find(x=>x.id===id)||{id:'POS-'+makeId('').slice(-8).toUpperCase(),title:'',type:'Engineer',group:'',managerId:'',secondaryManagerId:'',fte:1,status:'Not approved',hiringState:'Vacant',personId:'',startDate:($('#dateFilter').checked&&$('#asOf').value)||today,endDate:'',location:'',costCenter:'',jobFamily:''};
  $('#formValidation').classList.remove('show');$('#drawerTitle').textContent=newPosition?'New position':p.title;
  $('#drawerScenario').textContent=`${activeScenario().name} / ${newPosition?'new position':'position details'}`;
  $('#fPositionId').value=p.id;$('#fPositionId').readOnly=!newPosition;$('#fTitle').value=p.title;$('#fGroup').value=p.group;$('#fFte').value=p.fte;
  $('#fLocation').value=p.location||'';$('#fCostCenter').value=p.costCenter||'';$('#fJobFamily').value=p.jobFamily||'';
  for(const key of ['fHiring','fPerson','fName','fEmployeeNo'])$('#'+key).disabled=p.assignmentMode==='timeline';
  $('#fManager').disabled=$('#fSecondary').disabled=p.reportingMode==='timeline';
  $('#fStart').value=p.startDate;$('#fEnd').value=p.endDate;$('#fHiring').value=p.hiringState;
  $('#fType').innerHTML=allPositionTypes().map(x=>`<option ${x===p.type?'selected':''}>${esc(x)}</option>`).join('');
  $('#fStatus').innerHTML=STATUSES.map(x=>`<option ${x===p.status?'selected':''}>${esc(x)}</option>`).join('');
  const blocked=newPosition?new Set():descendantsOf(id);
  const managerOptions=people.filter(x=>x.id!==id&&!blocked.has(x.id)).sort((a,b)=>a.title.localeCompare(b.title));
  $('#fManager').innerHTML='<option value="">— Top level —</option>'+managerOptions.map(x=>`<option value="${esc(x.id)}" ${x.id===p.managerId?'selected':''}>${esc(x.title)} · ${esc(x.personName||x.hiringState)}</option>`).join('');
  $('#fSecondary').innerHTML='<option value="">— None —</option>'+people.filter(x=>x.id!==id).sort((a,b)=>a.title.localeCompare(b.title)).map(x=>`<option value="${esc(x.id)}" ${x.id===p.secondaryManagerId?'selected':''}>${esc(x.title)} · ${esc(x.personName||x.hiringState)}</option>`).join('');
  stackedTouched=false;
  const reports=activeScenario().positions.filter(x=>x.managerId===p.id);
  const effectiveStacked=reports.length?nodeStacked({...p,children:reports.map(c=>({...c,children:activeScenario().positions.filter(x=>x.managerId===c.id)}))}):false;
  $('#fStacked').checked=effectiveStacked;
  const assigned=new Set(activeScenario().positions.filter(x=>x.id!==id).map(x=>x.personId).filter(Boolean));
  $('#fPerson').innerHTML='<option value="__new__">＋ Add a new person</option>'+activeScenario().employees.filter(x=>!assigned.has(x.id)).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${esc(x.id)}">${esc(x.name)} · ${esc(x.id)}</option>`).join('');
  const person=activeScenario().employees.find(x=>x.id===p.personId);
  $('#fPerson').value=p.personId||'__new__';$('#fName').value=person?.name||'';$('#fEmployeeNo').value=person?.employeeNumber||'';
  photoDraft=person?.photo||null;drawerPersonSnapshot=person?JSON.stringify(person):null;updatePhotoNote();
  $('#groupSuggestions').innerHTML=[...new Set(people.map(p=>p.group).filter(Boolean))].sort().map(g=>`<option value="${esc(g)}"></option>`).join('');
  $('#locationSuggestions').innerHTML=[...new Set(people.map(p=>p.location).filter(Boolean))].sort().map(g=>`<option value="${esc(g)}"></option>`).join('');
  $('#familySuggestions').innerHTML=[...new Set(people.map(p=>p.jobFamily).filter(Boolean))].sort().map(g=>`<option value="${esc(g)}"></option>`).join('');
  $('#deleteBtn').classList.toggle('hidden',newPosition);$('#orderRow').classList.toggle('hidden',newPosition);$('#drawer').inert=false;$('#drawer').classList.add('open');updateAssignmentFields();updateOrderControls();drawerSnapshot=drawerFormState();setTimeout(()=>$('#fTitle').focus(),100);
}
function updatePhotoNote(){
  const note=$('#photoNote');if(!note)return;
  note.textContent=photoDraft?'Photo attached. Processed locally to a small PNG.':'Optional. Processed locally to a small PNG.';
}
function updateAssignmentFields(){
  const filled=$('#fHiring').value==='Filled';$('#assignmentFields').classList.toggle('hidden',!filled);$('#vacancyNote').classList.toggle('hidden',filled);
  const isNew=$('#fPerson').value==='__new__';$('#assignmentNote').textContent=isNew?'Creates a person only in this scenario. One person can occupy one position.':'Editing the name affects this scenario only. Unassign first to move this person to another position.';
}
function showValidation(msg){const el=$('#formValidation');el.textContent=msg;el.classList.add('show');el.scrollIntoView({block:'nearest'});}
function saveDrawer(){
  try{
    if(photoBusy)throw new Error('Photo processing is still in progress.');
    if(selectedSourceScenario!==workspace.activeScenarioId)throw new Error('The active scenario changed. Reopen this position before editing.');
    const id=$('#fPositionId').value.trim();if(selectedId&&id!==selectedId)throw new Error('Position IDs cannot be changed. They preserve comparison history.');
    if(!selectedId&&activeScenario().positions.some(p=>p.id===id))throw new Error('This position ID already exists.');
    const hiringState=$('#fHiring').value,personChoice=$('#fPerson').value,name=$('#fName').value.trim();
    const managerId=$('#fManager').value,secondaryManagerId=$('#fSecondary').value;
    if(secondaryManagerId&&secondaryManagerId===id)throw new Error('A position cannot have a dotted line to itself.');
    if(secondaryManagerId&&secondaryManagerId===managerId)throw new Error('Dotted-line manager must differ from the solid reporting line.');
    if(!selectedId?false:wouldCreateCycle(activeScenario().positions,id,managerId))throw new Error('That reporting line would create a cycle.');
    if(!selectedId&&managerId&&wouldCreateCycle([...activeScenario().positions,{id,managerId}],id,managerId))throw new Error('That reporting line would create a cycle.');
    const p={id,managerId,secondaryManagerId,title:$('#fTitle').value.trim(),type:$('#fType').value,status:$('#fStatus').value,group:$('#fGroup').value.trim(),fte:Number($('#fFte').value),hiringState,personId:hiringState==='Filled'?(personChoice==='__new__'?makeId('person'):personChoice):'',startDate:$('#fStart').value,endDate:$('#fEnd').value,location:$('#fLocation').value.trim(),costCenter:$('#fCostCenter').value.trim(),jobFamily:$('#fJobFamily').value.trim()};
    const employeeNumber=$('#fEmployeeNo').value.trim();
    updateScenario(s=>{
      if(p.personId){const latest=s.employees.find(x=>x.id===p.personId);if(latest&&p.personId===JSON.parse(drawerSnapshot||'{}').person&&drawerPersonSnapshot!==JSON.stringify(latest))throw new Error('This person changed while the position editor was open. Close and reopen it to keep the newer person record.');if(!name)throw new Error('A filled position requires a person name.');const existing=s.employees.find(x=>x.id===p.personId);if(existing){existing.name=name;existing.employeeNumber=employeeNumber;existing.photo=photoDraft?validPersonPhoto(photoDraft):null;}else s.employees.push({id:p.personId,name,employeeNumber,photo:photoDraft?validPersonPhoto(photoDraft):null});}
      const index=s.positions.findIndex(x=>x.id===selectedId);
      if(index>=0){
        const prev=s.positions[index];
        Object.assign(p,OrgFlowManagement.positionExtras(prev));
        if(prev.assignmentMode==='timeline'){p.personId=prev.personId;p.hiringState=prev.hiringState;}
        if(prev.reportingMode==='timeline'){p.managerId=prev.managerId;p.secondaryManagerId=prev.secondaryManagerId;}
        p.sortOrder=prev.sortOrder??0;
        if(stackedTouched)p.stacked=$('#fStacked').checked;
        else if(prev.stacked===true||prev.stacked===false)p.stacked=prev.stacked;
        s.positions[index]=p;
      }else{
        const siblings=s.positions.filter(x=>(x.managerId||'')===(p.managerId||''));
        p.sortOrder=siblings.reduce((m,x)=>Math.max(m,Number.isFinite(x.sortOrder)?x.sortOrder:-1),-1)+1;
        if(stackedTouched)p.stacked=$('#fStacked').checked;
        s.positions.push(p);
      }
    },'Position saved');
    activeRoles.add(p.type);activeStatuses.add(p.status);activeHiring.add(p.hiringState);setupChips();
    hidePositionEditor();render();
  }catch(error){showValidation(error.message);}
}
function deleteSelected(){
  if(!selectedId)return;const p=activeScenario().positions.find(x=>x.id===selectedId);if(!p)return;
  const direct=activeScenario().positions.filter(x=>x.managerId===p.id).length;
  if(!confirm(`Remove “${p.title}” from ${activeScenario().name}?\n\n${direct?`${direct} direct reporting position(s) will move to this position’s parent.`:'No reporting positions will be removed.'}${p.personId?' The assigned person will stay available for reassignment.':''}\n\nOther scenarios are not affected.`))return;
  try{updateScenario(s=>{s.positions=s.positions.filter(x=>x.id!==p.id);s.positions.forEach(x=>{if(x.managerId===p.id)x.managerId=p.managerId;if(x.secondaryManagerId===p.id)x.secondaryManagerId='';});},'Position removed; people records preserved');hidePositionEditor();}catch(error){showValidation(error.message);}
}
function setView(view){
  if(!['chart','positions','compare','management'].includes(view))return;
  if(drawerIsDirty()&&!confirm('Discard unsaved position edits and change view?'))return;
  hidePositionEditor();currentView=view;render();if(view==='chart')setTimeout(centerChart,0);
}
function renderPlanningHeader(){
  if(!workspace)return;
  const s=activeScenario();
  $('#scenarioSelect').innerHTML=workspace.scenarios.filter(x=>!x.archived).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}${x.id==='current'?' · live':''}</option>`).join('');$('#scenarioSelect').value=s.id;
  $$('.plan-tabs [data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===currentView);b.setAttribute('aria-pressed',String(b.dataset.view===currentView));});
  $('.toolbar').classList.toggle('hidden',currentView!=='chart');$('#canvasWrap').classList.toggle('hidden',currentView!=='chart');
  $('#positionsPanel').classList.toggle('hidden',currentView!=='positions');$('#comparePanel').classList.toggle('hidden',currentView!=='compare');$('#managementPanel').classList.toggle('hidden',currentView!=='management');$('.layout').classList.toggle('comparison-mode',currentView==='compare');
  const note=$('#scenarioNote');note.innerHTML=s.id==='current'?'<b>Current organization.</b> Edits here change Current only. Create a scenario to explore a proposed structure.':`<b>Planning: ${esc(s.name)} · ${esc(s.workflow?.state||'Draft')}.</b> Current is unchanged.<label class="check"><input id="highlightChanges" type="checkbox" ${showChartChanges?'checked':''}> Highlight changes vs original baseline</label>`;
  $('#highlightChanges')?.addEventListener('change',e=>{showChartChanges=e.target.checked;render();});
  if(modelLoadError){$('#loadError').classList.remove('hidden');$('#loadError').textContent=`Workspace could not be loaded: ${modelLoadError} Saved data has not been overwritten. Restore a backup from the Export menu.`;}
}
function matchesSearch(p,q){return `${p.id} ${p.name||''} ${p.personName||''} ${p.title} ${p.group} ${p.hiringState} ${p.location||''} ${p.costCenter||''} ${p.jobFamily||''} ${p.employeeNumber||''}`.toLowerCase().includes(q);}
function statusPill(text,kind){return `<span class="state-label ${kind||text.toLowerCase()}">${esc(text)}</span>`;}
let registerPage=0,registerPageKey='',directoryPage=0;const REGISTER_PAGE_SIZE=100;
function renderPositionTable(){
  const q=$('#search').value.trim().toLowerCase(),rows=people.filter(p=>baseVisible(p)&&(!q||matchesSearch(p,q))).sort((a,b)=>a.group.localeCompare(b.group)||a.title.localeCompare(b.title));
  const pageKey=workspace.activeScenarioId+'|'+rows.map(r=>r.id).join('|');if(pageKey!==registerPageKey){registerPage=0;registerPageKey=pageKey;}registerPage=Math.max(0,Math.min(registerPage,Math.ceil(rows.length/REGISTER_PAGE_SIZE)-1));
  const pageRows=rows.slice(registerPage*REGISTER_PAGE_SIZE,(registerPage+1)*REGISTER_PAGE_SIZE);
  const data={positions:rows},t=totals(data),byId=new Map(people.map(p=>[p.id,p]));
  $('#registerSummary').innerHTML=`<span><b>${t.positions}</b> matching positions</span><span><b>${t.filled}</b> filled</span><span><b>${t.open}</b> open</span><span><b>${fteText(t.approvedFte)}</b> approved FTE</span>`;
  $('#positionsRows').innerHTML=rows.length?pageRows.map(p=>`<tr class="${selectedIds.has(p.id)?'selected':''}"><td class="check-col"><input type="checkbox" data-select-position="${esc(p.id)}" ${selectedIds.has(p.id)?'checked':''} aria-label="Select ${esc(p.title)}" /></td><td class="title-cell">${esc(p.title)}<span class="sub">${esc(p.id)} · ${esc(p.type)}</span></td><td>${p.personName?esc(p.personName):'<span style="color:var(--muted)">Unassigned</span>'}</td><td>${esc(p.group||'—')}</td><td>${esc(p.location||'—')}</td><td>${statusPill(p.hiringState)}</td><td>${statusPill(p.status,p.status==='Approved'?'approved':'unapproved')}</td><td>${fteText(p.fte)}</td><td>${esc(byId.get(p.managerId)?.title||'Top level')}</td><td style="white-space:nowrap">${esc(p.startDate||'No start')}<span class="sub">${p.endDate?'Until '+esc(p.endDate):'No end date'}</span></td><td><button class="btn compact-btn" data-edit-position="${esc(p.id)}" aria-label="Edit ${esc(p.title)}">Edit</button></td></tr>`).join(''):`<tr><td colspan="11" class="empty-row">${activeFilterItems().length?'No matching positions. <button class="small-link" type="button" data-clear-filters>Clear all filters &amp; search</button> to see every seat in this scenario.':'No positions in this scenario yet. Add one, import a CSV, or load an example.'}</td></tr>`;
  const allBox=$('#registerSelectAll');if(allBox)allBox.checked=rows.length>0&&rows.every(p=>selectedIds.has(p.id));
  const seatedIds=new Set(people.map(p=>p.personId).filter(Boolean)),unassigned=activeScenario().employees.filter(e=>!seatedIds.has(e.id));
  $('#registerPagination').innerHTML=`<button class="btn" data-register-page="-1" ${registerPage?'':'disabled'}>Previous</button><span>Page ${registerPage+1} of ${Math.max(1,Math.ceil(rows.length/REGISTER_PAGE_SIZE))} · ${rows.length} matching positions</span><button class="btn" data-register-page="1" ${(registerPage+1)*REGISTER_PAGE_SIZE<rows.length?'':'disabled'}>Next</button>`;
  $('#registerFootnote').innerHTML=`Positions and people are separate. <b>${unassigned.length} unassigned ${unassigned.length===1?'person':'people'}</b> remain in this scenario’s directory and can be selected when filling a position. <button class="small-link" id="showUnassigned">Open people directory</button><br>Search and sidebar filters apply here; collapsed chart levels do not.`;
  $('#showUnassigned')?.addEventListener('click',()=>openDirectory());
}
let personEditingId=null,personPhotoDraft=null,personEditSession=0,personPhotoBusy=false,personSnapshot=null;
function openDirectory(){if(drawerIsDirty()&&!confirm('Discard unsaved position edits before opening people?'))return;hidePositionEditor();renderPeopleDirectory();openDialog('directoryModal');}
function renderPeopleDirectory(){
  const s=activeScenario(),seats=new Map();syncProjection();
  for(const p of people)if(p.personId){if(!seats.has(p.personId))seats.set(p.personId,[]);seats.get(p.personId).push(p);}
  const query=$('#directorySearch').value.trim().toLowerCase(),kind=$('#directoryFilter').value;
  const all=[...s.employees].sort((a,b)=>a.name.localeCompare(b.name)),rows=all.filter(p=>(!query||`${p.name} ${p.id} ${p.employeeNumber} ${p.externalId} ${(p.skills||[]).join(' ')}`.toLowerCase().includes(query))&&(!kind||(kind==='seated')===seats.has(p.id)));
  directoryPage=Math.max(0,Math.min(directoryPage,Math.ceil(rows.length/REGISTER_PAGE_SIZE)-1));
  const pageRows=rows.slice(directoryPage*REGISTER_PAGE_SIZE,(directoryPage+1)*REGISTER_PAGE_SIZE);
  $('#directoryTitle').textContent=`People · ${s.name}`;
  const seated=all.filter(p=>seats.has(p.id)).length;
  $('#directoryCount').textContent=`${all.length} people · ${seated} seated · ${all.length-seated} unassigned · staffing as of ${projectionDate}`;
  $('#directoryRows').innerHTML=rows.length?pageRows.map(p=>{
    const seat=seats.get(p.id);
    return `<tr><td class="title-cell">${esc(p.name)}<span class="sub">${esc((p.skills||[]).join(', '))}</span></td><td>${esc(p.employeeNumber||'—')}</td><td>${seat?esc(seat.map(p=>p.title).join('; ')):'<span style="color:var(--muted)">Unassigned</span>'}</td><td class="sub">${esc(p.id)} · ${fteText(p.capacityFte??1)} FTE</td><td><button class="btn compact-btn" data-person-edit="${esc(p.id)}">Edit</button>${seat?'':` <button class="btn compact-btn" data-person-remove="${esc(p.id)}">Remove</button>`}</td></tr>`;
  }).join(''):'<tr><td colspan="5" class="empty-row">No matching people. Clear search or add a person.</td></tr>';
  $('#directoryPagination').innerHTML=`<button class="btn" data-directory-page="-1" ${directoryPage?'':'disabled'}>Previous</button><span>Page ${directoryPage+1} of ${Math.max(1,Math.ceil(rows.length/REGISTER_PAGE_SIZE))} · ${rows.length} matching people</span><button class="btn" data-directory-page="1" ${(directoryPage+1)*REGISTER_PAGE_SIZE<rows.length?'':'disabled'}>Next</button>`;
}

function updatePersonPhotoNote(){const note=$('#personPhotoNote');if(note)note.textContent=personPhotoDraft?'Photo attached. Processed locally to a small PNG.':'Optional. Processed locally to a small PNG.';}
function openPersonModal(id=''){
  personEditSession++;personPhotoBusy=false;
  const emp=id?activeScenario().employees.find(x=>x.id===id):null;
  if(id&&!emp){toast('This person no longer exists in the scenario.');renderPeopleDirectory();return;}
  personEditingId=emp?emp.id:null;
  $('#personTitle').textContent=emp?`Edit ${emp.name}`:'Add person';
  $('#personCapacity').value=emp?.capacityFte??1;$('#personSkills').value=(emp?.skills||[]).join(', ');$('#personExternalId').value=emp?.externalId||'';
  $('#personName').value=emp?.name||'';$('#personEmployeeNo').value=emp?.employeeNumber||'';
  personPhotoDraft=emp?.photo||null;updatePersonPhotoNote();
  $('#personValidation').classList.remove('show');$('#personValidation').textContent='';
  personSnapshot=personFormState();openDialog('personModal');setTimeout(()=>{if($('#personModal').classList.contains('open'))$('#personName').focus();},50);
}
function personFormState(){return JSON.stringify([$('#personName').value,$('#personEmployeeNo').value,$('#personCapacity').value,$('#personSkills').value,$('#personExternalId').value,personPhotoDraft]);}
function savePersonModal(){
  if(personPhotoBusy){toast('The photo is still processing. Save when it finishes.');return;}
  const name=$('#personName').value.trim(),employeeNumber=$('#personEmployeeNo').value.trim();
  try{
    if(!name)throw new Error('A name is required.');
    const extras=OrgFlowManagement.personExtras({capacityFte:Number($('#personCapacity').value),skills:$('#personSkills').value.split(',').map(v=>v.trim()).filter(Boolean),externalId:$('#personExternalId').value});
    updateScenario(s=>{
      const existing=personEditingId?s.employees.find(x=>x.id===personEditingId):null;
      if(personEditingId&&!existing)throw new Error('This person no longer exists in the scenario.');
      if(existing){Object.assign(existing,extras);existing.name=name;existing.employeeNumber=employeeNumber;existing.photo=personPhotoDraft?validPersonPhoto(personPhotoDraft):null;}
      else s.employees.push({...extras,id:makeId('person'),name,employeeNumber,photo:personPhotoDraft?validPersonPhoto(personPhotoDraft):null});
    },personEditingId?'Person updated':'Person added');
    personSnapshot=null;closeDialog('personModal');renderPeopleDirectory();
  }catch(error){$('#personValidation').textContent=error.message;$('#personValidation').classList.add('show');}
}
function removePerson(id){
  const s=activeScenario(),emp=s.employees.find(x=>x.id===id);if(!emp)return;
  if((s.assignments||[]).some(r=>r.personId===id)||(s.allocations||[]).some(r=>r.personId===id)){toast('This person has dated assignments or project allocations. Remove those records before deleting the person.');return;}
  const seat=s.positions.find(p=>p.personId===id);
  if(seat){toast(`Unassign ${emp.name} from “${seat.title}” first — only unassigned people can be removed.`);return;}
  if(!confirm(`Remove ${emp.name} from “${s.name}”? Their record is deleted from this scenario only.`))return;
  try{updateScenario(x=>{x.employees=x.employees.filter(p=>p.id!==id);},'Person removed');renderPeopleDirectory();}catch(error){toast(error.message);}
}
function comparisonData(){
  let target=scenarioById(compareTargetId);if(!target||target.archived){target=workspace.activeScenarioId!=='current'&&!activeScenario().archived?activeScenario():workspace.scenarios.find(s=>s.id!=='current'&&!s.archived)||activeScenario();compareTargetId=target.id;}
  let base=compareBaselineId==='__snapshot__'?target.baseSnapshot:scenarioById(compareBaselineId);
  if(base?.archived)base=null;
  if(!base){base=scenarioById('current');compareBaselineId='current';}
  return {baseline:base,target,changes:scenarioChanges(base,target)};
}
function visibleChanges(data){
  const q=$('#compareSearch').value.trim().toLowerCase();
  return data.changes.filter(c=>(compareKind==='all'?c.kind!=='unchanged':c.kind===compareKind)&&(!q||[c.id,c.before?.title,c.after?.title,c.before?.group,c.after?.group,data.baseline.employees.find(e=>e.id===c.before?.personId)?.name,data.target.employees.find(e=>e.id===c.after?.personId)?.name].filter(Boolean).join(' ').toLowerCase().includes(q)));
}
function renderComparison(){
  const one=workspace.scenarios.filter(s=>!s.archived).length===1;$('#compareWelcome').classList.toggle('hidden',!one);$('#compareContent').classList.toggle('hidden',one);if(one)return;
  const d=comparisonData(),a=totals({...d.baseline,positions:OrgFlowManagement.effectivePositions(d.baseline,today)}),b=totals({...d.target,positions:OrgFlowManagement.effectivePositions(d.target,today)});
  const recordChanges=OrgFlowManagement.mergeSnapshots(d.baseline,d.target,d.baseline).changes.filter(c=>c.collection!=='positions');
  const recordsByKind={};for(const c of recordChanges)recordsByKind[c.collection]=(recordsByKind[c.collection]||0)+1;
  $('#comparisonRecordChanges').innerHTML=`<b>Beyond position fields:</b> ${recordChanges.length?Object.entries(recordsByKind).map(([kind,n])=>esc(kind)+': '+n).join(' · '):'No other changed records.'} <span>Headcounts use assignments effective ${esc(today)}. Planning → Decisions lists dated and budget changes; Planning → Forecast shows their monthly impact. Position CSV comparisons do not include these records.</span>`;
  const scenarioOptions=workspace.scenarios.filter(s=>!s.archived).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.id==='current'?' (live)':''}</option>`).join('');
  $('#compareBaseline').innerHTML=scenarioOptions+(d.target.baseSnapshot?'<option value="__snapshot__">Original baseline (frozen)</option>':'');$('#compareBaseline').value=compareBaselineId;$('#compareTarget').innerHTML=scenarioOptions;$('#compareTarget').value=d.target.id;
  $('#comparisonMetrics').innerHTML=[['positions','Positions'],['filled','Filled positions'],['open','Open positions'],['approvedFte','Approved FTE']].map(([key,label])=>{const delta=Math.round((b[key]-a[key])*100)/100;return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-values"><span>${fteText(a[key])} →</span> ${fteText(b[key])}</div><div class="delta ${delta>0?'positive':delta<0?'negative':''}">${delta>0?'+':''}${fteText(delta)} ${delta===0?'· no net change':'vs baseline'}</div></div>`;}).join('');
  $('#baselineContext').textContent=compareBaselineId==='__snapshot__'?`Frozen ${d.baseline.name} snapshot · ${fmtDate(d.baseline.capturedAt?.slice(0,10))}`:`Comparing saved ${d.baseline.name} → ${d.target.name}. Independent scenarios; no automatic merge.`;
  const changedCount=d.changes.filter(c=>c.kind!=='unchanged').length;
  $('#changeChips').innerHTML=[['all','All changes',changedCount],['added','Added'],['removed','Removed'],['changed','Changed'],['unchanged','Unchanged']].map(([kind,label,count])=>`<button class="chip ${compareKind===kind?'active':''}" data-change-kind="${kind}" aria-pressed="${compareKind===kind}">${label}<b>${count??d.changes.filter(c=>c.kind===kind).length}</b></button>`).join('');
  const rows=visibleChanges(d);
  $('#comparisonRows').innerHTML=rows.length?rows.map(c=>{
    const p=c.after||c.before,short=c.kind==='added'?`New ${p.type.toLowerCase()} · ${fteText(p.fte)} FTE · ${p.hiringState}`:c.kind==='removed'?`Position removed · ${fteText(p.fte)} FTE`:c.kind==='unchanged'?'No changes to this position or its assigned person.':c.fields.map(f=>f.label).join(' · ');
    return `<tr data-change-id="${esc(c.id)}"><td>${statusPill(c.kind[0].toUpperCase()+c.kind.slice(1),c.kind)}</td><td class="title-cell">${esc(p.title)}<span class="sub">${esc(c.id)} · ${esc(p.group||'No group')}</span></td><td class="change-list">${esc(short)}</td><td><button class="btn compact-btn" data-diff-toggle="${esc(c.id)}" aria-expanded="false">Details</button></td></tr><tr class="change-details hidden" data-detail-id="${esc(c.id)}"><td colspan="4"><div class="detail-grid">${diffDetailsHTML(c,d)}</div></td></tr>`;
  }).join(''):'<tr><td colspan="4" class="empty-row">'+(changedCount?'No changes match this search or category.':recordChanges.length?'No position-field differences. People, dated records or budgets changed; see the record summary above.':`No differences — “${esc(d.target.name)}” is identical to ${compareBaselineId==='__snapshot__'?'its frozen baseline':'“'+esc(d.baseline.name)+'”'}. It was copied there; add, move or edit positions in that scenario, then compare again.`)+'</td></tr>';
  $('#comparisonFootnote').textContent=`${rows.length} ${compareKind==='unchanged'?'unchanged positions':'matching positions'} shown · ${changedCount} changed positions in the full comparison. Total FTE: ${fteText(a.fte)} → ${fteText(b.fte)}. Exports use the category and search above; summary totals always cover both full snapshots. A move appears as Changed, not a removal and addition.`;
}
function diffDetailsHTML(change,data){
  const fields=change.kind==='changed'?change.fields:DIFF_FIELDS.map(([key,label])=>({key,label,before:change.before?.[key],after:change.after?.[key]}));
  return `<table><thead><tr><th>Field</th><th>${esc(data.baseline.name)} · before</th><th>${esc(data.target.name)} · after</th></tr></thead><tbody>`+fields.map(f=>`<tr><td>${esc(f.label)}</td><td>${change.before?esc(fieldValue(f.key,f.before,data.baseline)):'—'}</td><td>${change.after?esc(fieldValue(f.key,f.after,data.target)):'—'}</td></tr>`).join('')+'</tbody></table>';
}
// Safari does not focus clicked buttons by default; dialog return focus needs a stable trigger.
document.addEventListener('click',event=>{const button=event.target.closest?.('button');if(button&&!button.disabled)button.focus({preventScroll:true});},true);
const dialogStack=[];
function openDialog(id){
  const existing=dialogStack.findIndex(d=>d.id===id);
  const originalFocus=existing>=0?dialogStack[existing].focus:document.activeElement;
  if(existing>=0)dialogStack.splice(existing,1);
  dialogStack.push({id,focus:originalFocus});
  const el=$('#'+id);el.inert=false;el.classList.add('open');
  dialogStack.forEach((d,i)=>{$('#'+d.id).inert=i!==dialogStack.length-1;});
  setTimeout(()=>{if(dialogStack.at(-1)?.id===id&&el.classList.contains('open'))el.querySelector('input:not([hidden]),select,button')?.focus();},0);
}
function closeDialog(id,force=false){
  if(!force&&window.OrgFlowPlanningUI?.canCloseDialog&&!window.OrgFlowPlanningUI.canCloseDialog(id))return false;
  if(id==='personModal'&&!force&&personSnapshot!==null&&personSnapshot!==personFormState()&&!confirm('Discard unsaved person edits?'))return false;
  if(id==='personModal'){personEditSession++;personPhotoBusy=false;personSnapshot=null;}
  const index=dialogStack.findIndex(d=>d.id===id),entry=index>=0?dialogStack[index]:null;
  if(index>=0)dialogStack.splice(index,1);
  const el=$('#'+id);el.classList.remove('open');el.inert=true;
  const top=dialogStack.at(-1);if(top)$('#'+top.id).inert=false;
  if(entry?.focus?.isConnected&&entry.focus.getClientRects().length)entry.focus.focus({preventScroll:true});
  else if(top)$('#'+top.id).querySelector('button,input,select')?.focus();
  return true;
}
function openScenarioDialog(mode='create'){
  if(drawerIsDirty()){if(!confirm('Discard unsaved position edits before opening scenario settings?'))return;}hidePositionEditor();
  scenarioDialogMode=mode;const s=activeScenario(),edit=mode==='edit';$('#scenarioValidation').classList.remove('show');
  $('#scenarioModalTitle').textContent=edit?'Scenario details':'Create a scenario';$('#scenarioModalSubtitle').textContent=edit?'This name and notes belong to this scenario.':'Explore a new structure without changing your source.';
  $('#scenarioSourceField').classList.toggle('hidden',edit);$('#scenarioSource').innerHTML=workspace.scenarios.filter(s=>!s.archived).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');$('#scenarioSource').value=s.id;
  $('#scenarioName').value=edit?s.name:'';$('#scenarioName').readOnly=edit&&s.id==='current';$('#scenarioDescription').value=edit?s.description:'';
  $('#scenarioDelete').classList.toggle('hidden',!edit||s.id==='current');$('#scenarioArchive').classList.toggle('hidden',!edit||s.id==='current');$('#scenarioSave').textContent=edit?'Save details':'Create scenario';
  const archived=workspace.scenarios.filter(x=>x.archived);
  $('#archivedScenarios').classList.toggle('hidden',!archived.length);
  $('#archivedScenarios').innerHTML=archived.length?`<div class="form-divider">Archived scenarios</div>`+archived.map(x=>`<div class="archived-row"><span>${esc(x.name)}</span><button class="btn compact-btn" type="button" data-unarchive="${esc(x.id)}">Restore</button></div>`).join(''):'';
  $('#scenarioModalNote').textContent=edit&&s.id==='current'?'Current is protected from renaming and deletion. Create a scenario before exploring changes.':edit?'Changes to positions and people stay in this scenario. Its original comparison snapshot never changes.':'Copies keep stable position IDs and a frozen source snapshot. Edits stay in the new scenario. Approval labels are not an authorization workflow.';
  openDialog('scenarioModal');setTimeout(()=>$('#scenarioName').focus(),10);
}
function saveScenarioDialog(){
  try{const name=$('#scenarioName').value.trim(),description=$('#scenarioDescription').value.trim();if(scenarioDialogMode==='create')createScenario(name,$('#scenarioSource').value,description);else updateScenario(s=>{s.name=name;s.description=description;},'Scenario details saved');closeDialog('scenarioModal');}
  catch(error){$('#scenarioValidation').textContent=error.message;$('#scenarioValidation').classList.add('show');}
}
function setFiltersOpen(open){
  $('.layout')?.classList.toggle('filters-open',!!open);
  const btn=$('#filterToggle');if(!btn)return;
  btn.setAttribute('aria-expanded',String(!!open));
  btn.title=open?'Close filters':'Filters';
  btn.setAttribute('aria-label',open?'Close filters':'Open filters');
}
function applyDefaultFilters(){
  knownGroups=null;knownSites=null;
  activeRoles=new Set(allPositionTypes());activeStatuses=new Set(STATUSES);activeHiring=new Set(HIRING_STATES);
  activeGroups=new Set(allGroups());activeSites=new Set(allSites());
  $('#search').value='';$('#compareSearch').value='';$('#dateFilter').checked=false;$('#asOf').value=today;
  maxDepth=99;collapsed.clear();zoom=1;showChartChanges=true;compareKind='all';currentView='chart';
  compareBaselineId='current';compareTargetId=workspace?.scenarios.find(s=>s.id!=='current'&&!s.archived)?.id||'current';
  $$('#depthSeg button').forEach(b=>b.classList.toggle('active',b.dataset.depth==='99'));
  setFiltersOpen(false);
  setupChips();
}
function resetFilters(){
  applyDefaultFilters();render();
}
function activeFilterItems(){
  const items=[],types=allPositionTypes(),groups=allGroups(),sites=allSites(),q=$('#search').value.trim();
  if(q)items.push(`Search “${exportText(q,26)}”`);
  if(activeRoles.size<types.length)items.push(`Type ${activeRoles.size} of ${types.length}`);
  if(activeStatuses.size<STATUSES.length)items.push(`Approval ${activeStatuses.size} of ${STATUSES.length}`);
  if(activeHiring.size<HIRING_STATES.length)items.push(`Hiring ${activeHiring.size} of ${HIRING_STATES.length}`);
  if(activeGroups&&activeGroups.size<groups.length)items.push(`Group ${activeGroups.size} of ${groups.length}`);
  if(activeSites&&activeSites.size<sites.length)items.push(`Site ${activeSites.size} of ${sites.length}`);
  if($('#dateFilter').checked&&$('#asOf').value)items.push(`As of ${fmtDate($('#asOf').value)}`);
  return items;
}
function syncDateFilterUi(){
  const on=$('#dateFilter').checked,d=$('#asOf').value;
  $('#asOf').disabled=!on;$('#asOf').setAttribute('aria-disabled',String(!on));
  const hint=$('#asOfHint');if(hint)hint.textContent=!on?'All position dates — staffing and reporting show today. Enable a date for historical or future assignments.':d?`Only positions active on ${fmtDate(d)} — later starts and already-ended roles are hidden.`:'Pick a date — every position shows until then.';
  $('#datePill').textContent=on&&d?`As of ${fmtDate(d)}`:'All dates';
}
function renderFilterStrip(){
  const strip=$('#filterStrip');if(!strip)return;
  const items=activeFilterItems(),on=items.length>0;
  strip.hidden=!on;document.querySelector('main')?.classList.toggle('filters-on',on);
  $('#filterStripItems').innerHTML=items.map(x=>`<span class="filter-pill">${esc(x)}</span>`).join('');
  const note=$('#filterStripNote');if(note)note.textContent=on&&currentView==='compare'?'· chart & register only — Compare uses full snapshots':'';
  const ft=$('#filterToggle');if(ft)ft.dataset.count=items.length?String(items.length):'';
}
function clearAllFilters(){
  knownGroups=null;knownSites=null;
  activeRoles=new Set(allPositionTypes());activeStatuses=new Set(STATUSES);activeHiring=new Set(HIRING_STATES);
  activeGroups=new Set(allGroups());activeSites=new Set(allSites());
  $('#search').value='';$('#dateFilter').checked=false;$('#asOf').value=today;
  maxDepth=99;collapsed.clear();
  $$('#depthSeg button').forEach(b=>b.classList.toggle('active',b.dataset.depth==='99'));
  setupChips();render();toast('All filters and search cleared');
}
function activeDateNote(){
  return $('#dateFilter').checked&&$('#asOf').value?` · as of ${fmtDate($('#asOf').value)}`:'';
}
function syncChartDisplayUi(){
  const d=cardDisplay,map={showFte:'fte',showSite:'site',showGroup:'group',showType:'type',showApproval:'approval',showHiring:'hiring',showCumulative:'cumulative',showSpan:'span',chartDots:'chartDots'};
  for(const [id,key] of Object.entries(map)){const el=$('#'+id);if(el)el.checked=!!d[key];}
  if($('#groupGap')){$('#groupGap').value=String(d.groupGap);if($('#groupGapValue'))$('#groupGapValue').textContent=d.groupGap+' px';}
  document.querySelector('main')?.classList.toggle('no-chart-dots',!d.chartDots);
  renderCustomLevels();
}
function readCardDisplayFromUi(){
  cardDisplay=sanitizeCardDisplay({
    fte:$('#showFte')?.checked,site:$('#showSite')?.checked,group:$('#showGroup')?.checked,type:$('#showType')?.checked,
    approval:$('#showApproval')?.checked,hiring:$('#showHiring')?.checked,cumulative:$('#showCumulative')?.checked,
    span:$('#showSpan')?.checked,groupGap:$('#groupGap')?Number($('#groupGap').value):cardDisplay.groupGap,chartDots:$('#chartDots')?.checked
  });
  if($('#groupGapValue'))$('#groupGapValue').textContent=cardDisplay.groupGap+' px';
  document.querySelector('main')?.classList.toggle('no-chart-dots',!cardDisplay.chartDots);
  render();
}
function renderCustomLevels(){
  const host=$('#customLevels');if(!host)return;
  const levels=workspace?.positionLevels||[];
  host.innerHTML=levels.length?levels.map(name=>`<li><span>${esc(name)}</span><button type="button" class="btn ghost" data-remove-level="${esc(name)}">Remove</button></li>`).join(''):'';
}
function addPositionLevel(){
  const name=$('#newLevelName')?.value.trim();if(!name){$('#newLevelName')?.focus();return;}
  try{
    const next=structuredClone(workspace);
    const before=(next.positionLevels||[]).length;
    next.positionLevels=OrgFlow.sanitizePositionLevels([...(next.positionLevels||[]),name]);
    if(next.positionLevels.length===before)throw new Error('That tag already exists, or it matches a built-in type such as Engineer, Graduate or Intern.');
    commitPlanning(next,`Added tag ${next.positionLevels.at(-1)}`);
    activeRoles.add(next.positionLevels.at(-1));
    if($('#newLevelName'))$('#newLevelName').value='';
    setupChips();render();
  }catch(error){toast(error.message);}
}
function removePositionLevel(name){
  const used=(workspace.scenarios||[]).some(s=>s.positions.some(p=>p.type===name)||s.baseSnapshot?.positions?.some(p=>p.type===name));
  if(used){toast('Retype or remove positions that use this tag first.');return;}
  try{
    const next=structuredClone(workspace);
    next.positionLevels=(next.positionLevels||[]).filter(x=>x!==name);
    commitPlanning(next,`Removed tag ${name}`);
    activeRoles.delete(name);setupChips();render();
  }catch(error){toast(error.message);}
}
function updateOrderControls(){
  const up=$('#moveUpBtn'),down=$('#moveDownBtn');if(!up||!down)return;
  if(!selectedId){up.disabled=true;down.disabled=true;return;}
  const {index,count}=siblingIndex(activeScenario().positions,selectedId);
  up.disabled=index<=0;down.disabled=index<0||index>=count-1;
}
function moveSelected(delta){
  if(!selectedId||enterpriseBlocksWrite())return;
  try{updateScenario(s=>{s.positions=reorderSiblings(s.positions,selectedId,delta);},'Reporting order updated');}
  catch(error){toast(error.message);}
}
function setupHiringChips(){
  $('#hiringChips').innerHTML=HIRING_STATES.map(s=>`<button class="chip ${activeHiring.has(s)?'active':''}" data-hiring="${s}" aria-pressed="${activeHiring.has(s)}">${s}</button>`).join('');
  $('#hiringChips').onclick=e=>{const b=e.target.closest('[data-hiring]');if(!b)return;const v=b.dataset.hiring;activeHiring.has(v)?activeHiring.delete(v):activeHiring.add(v);setupHiringChips();render();};
}
function rememberPlanningView(){
  if(!workspace||modelLoadError)return;
  const text=JSON.stringify(captureView());
  if(text===lastViewText)return;
  const initial=!lastViewText;lastViewText=text;
  clearTimeout(savedViewTimer);savedViewTimer=setTimeout(()=>{safePreference('orgflow.planning.view.v2',text);if(!workspaceIOBusy)writeDurable(workspace);},150);
  if(!initial)scheduleFileAutosave();
}
function setupPlanningEvents(){
  $('#scenarioSelect').onchange=e=>switchScenario(e.target.value);$('#newScenarioBtn').onclick=$('#compareCreateBtn').onclick=()=>openScenarioDialog();$('#scenarioSettingsBtn').onclick=()=>openScenarioDialog('edit');
  $$('.plan-tabs [data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('#registerAddBtn').onclick=()=>openDrawer('',true);
  $('#positionsRows').onclick=e=>{
    if(e.target.closest?.('[data-clear-filters]')){clearAllFilters();return;}
    const box=e.target.closest?.('[data-select-position]');
    if(box){e.stopPropagation();toggleSelected(box.dataset.selectPosition,true);return;}
    const b=e.target.closest('[data-edit-position]');if(b)openDrawer(b.dataset.editPosition);
  };
  $('#registerSelectAll')?.addEventListener('change',e=>{
    const q=$('#search').value.trim().toLowerCase();
    const rows=people.filter(p=>baseVisible(p)&&(!q||matchesSearch(p,q)));
    if(e.target.checked)rows.forEach(p=>selectedIds.add(p.id));else rows.forEach(p=>selectedIds.delete(p.id));
    render();
  });
  $('#scenarioClose').onclick=$('#scenarioCancel').onclick=()=>closeDialog('scenarioModal');$('#scenarioSave').onclick=saveScenarioDialog;
  $('#scenarioDelete').onclick=()=>{const id=workspace.activeScenarioId;if(confirm(`Delete “${activeScenario().name}”? This cannot be undone. Current and other scenarios will be kept.`)){try{deleteScenario(id);closeDialog('scenarioModal');}catch(error){$('#scenarioValidation').textContent=error.message;$('#scenarioValidation').classList.add('show');}}};
  $('#scenarioArchive').onclick=()=>{const id=workspace.activeScenarioId;if(confirm(`Archive “${activeScenario().name}”? It leaves the scenario switcher and compare lists but keeps its data and snapshot.`)){toggleScenarioArchive(id,true);closeDialog('scenarioModal');}};
  $('#archivedScenarios').onclick=e=>{const b=e.target.closest('[data-unarchive]');if(b){toggleScenarioArchive(b.dataset.unarchive,false);openScenarioDialog(scenarioDialogMode);}};
  $('#fHiring').onchange=updateAssignmentFields;$('#fPerson').onchange=()=>{const emp=activeScenario().employees.find(p=>p.id===$('#fPerson').value);drawerPersonSnapshot=emp?JSON.stringify(emp):null;$('#fName').value=emp?.name||'';$('#fEmployeeNo').value=emp?.employeeNumber||'';photoDraft=emp?.photo||null;updatePhotoNote();updateAssignmentFields();};
  $('#compareBaseline').onchange=e=>{compareBaselineId=e.target.value;renderComparison();rememberPlanningView();};$('#compareTarget').onchange=e=>{compareTargetId=e.target.value;renderComparison();rememberPlanningView();};
  $('#compareSearch').oninput=renderComparison;$('#changeChips').onclick=e=>{const b=e.target.closest('[data-change-kind]');if(b){compareKind=b.dataset.changeKind;renderComparison();rememberPlanningView();}};
  $('#comparisonRows').onclick=e=>{const b=e.target.closest('[data-diff-toggle]');if(!b)return;const row=$$('[data-detail-id]').find(r=>r.dataset.detailId===b.dataset.diffToggle);const expanded=row.classList.contains('hidden');row.classList.toggle('hidden',!expanded);b.setAttribute('aria-expanded',String(expanded));b.textContent=expanded?'Hide':'Details';};
  $('#comparisonCSVBtn').onclick=exportComparisonCSV;$('#comparisonPNGBtn').onclick=exportComparisonPNG;
  $('#resetFilters').onclick=resetFilters;
  $('#clearFiltersBtn').onclick=clearAllFilters;
  $('#emptyClearFilters').onclick=clearAllFilters;
  $('#filterToggle').onclick=()=>setFiltersOpen(!$('.layout').classList.contains('filters-open'));
  $('#closeFilters').onclick=()=>setFiltersOpen(false);
  $('#directoryClose').onclick=()=>closeDialog('directoryModal');
  $('#directoryBtn').onclick=openDirectory;$('#directoryAdd').onclick=()=>openPersonModal('');
  $('#directoryRows').onclick=e=>{const ed=e.target.closest('[data-person-edit]');if(ed){openPersonModal(ed.dataset.personEdit);return;}const rm=e.target.closest('[data-person-remove]');if(rm)removePerson(rm.dataset.personRemove);};
  $('#personClose').onclick=$('#personCancel').onclick=()=>closeDialog('personModal');
  $('#personSave').onclick=savePersonModal;
  $('#personPhotoUpload').onclick=()=>{$('#personPhotoInput').value='';$('#personPhotoInput').click();};
  $('#personPhotoInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;const session=personEditSession;personPhotoBusy=true;try{const photo=await normalizePersonPhoto(file);if(session!==personEditSession)return;personPhotoDraft=photo;updatePersonPhotoNote();toast('Photo attached');}catch(error){if(session===personEditSession)toast(error.message||'Could not use this photo.');}finally{if(session===personEditSession)personPhotoBusy=false;}};
  $('#personPhotoRemove').onclick=()=>{personPhotoDraft=null;updatePersonPhotoNote();};
  $('#moveUpBtn').onclick=()=>moveSelected(-1);
  $('#moveDownBtn').onclick=()=>moveSelected(1);
  $('#fStacked').onchange=()=>{stackedTouched=true;};
  $('#addLevelBtn').onclick=addPositionLevel;
  $('#newLevelName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addPositionLevel();}};
  $('#customLevels').onclick=e=>{const b=e.target.closest('[data-remove-level]');if(b)removePositionLevel(b.dataset.removeLevel);};
  $('#saveViewBtn').onclick=saveNamedView;
  $('#namedViewName')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveNamedView();}});
  $('#namedViewSelect')?.addEventListener('change',applyNamedView);
  $('#deleteViewBtn').onclick=deleteNamedView;
  $('#bulkApplyBtn').onclick=applyBulkEdit;
  $('#bulkClearBtn').onclick=clearSelection;
  $('#saveWorkspaceBtn').onclick=async()=>{if(await allowEnterpriseExport('workspace'))saveWorkspaceToDisk(false);};
  $('#saveWorkspaceAsBtn').onclick=async()=>{if(await allowEnterpriseExport('workspace'))saveWorkspaceToDisk(true);};
  $('#printBtn').onclick=async()=>{if(await allowEnterpriseExport('a3'))exportA3Pages();};
  for(const id of ['showFte','showSite','showGroup','showType','showApproval','showHiring','showCumulative','showSpan','chartDots']){
    const el=$('#'+id);if(el)el.onchange=readCardDisplayFromUi;
  }
  if($('#groupGap'))$('#groupGap').oninput=readCardDisplayFromUi;
  for(const id of ['scenarioModal','directoryModal','personModal','welcomeModal','historyModal','shareModal']){
    if(!$('#'+id))continue;
    $('#'+id).addEventListener('click',e=>{if(e.target===$('#'+id))closeDialog(id);});
    $('#'+id).addEventListener('keydown',e=>trapDialogFocus(e,id));
  }
  $('#importModal').addEventListener('keydown',e=>trapDialogFocus(e,'importModal'));
  $('#shareClose').onclick=$('#shareCancel').onclick=()=>closeDialog('shareModal');
  $('#shareExport').onclick=exportInteractiveChart;
  $('#drawer').addEventListener('keydown',e=>{trapDialogFocus(e,'drawer');if(e.key==='Escape'){e.stopPropagation();requestCloseDrawer();}if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();saveDrawer();}});

  // Ignore unrelated keys; desktop shortcuts do not fire while writing in forms.
  svg.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.closest('.node')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
}
function trapDialogFocus(e,id){
  if(e.key!=='Tab')return;const focus=[...$('#'+id).querySelectorAll('button:not([disabled]),input:not([hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(x=>x.getClientRects().length);const first=focus[0],last=focus.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
}

let zoom=1;
let chartBounds={width:600,height:400};
function baseVisible(p){
  const groups=activeGroups||new Set(allGroups()),sites=activeSites||new Set(allSites());
  return activeRoles.has(p.type)&&activeStatuses.has(p.status)&&activeHiring.has(p.hiringState)&&dateOk(p)
    &&groups.has(filterLabel(p.group,EMPTY_GROUP))&&sites.has(filterLabel(p.location,EMPTY_SITE));
}
function layoutTree(nodes){
  applyCardSizes(nodes,cardDisplay);
  return layoutOrgChart(nodes,cardDisplay);
}
function chartDiffMap(){
  const s=activeScenario();return s.baseSnapshot&&showChartChanges?new Map(scenarioChanges(s.baseSnapshot,s).map(d=>[d.id,d.kind])):new Map();
}
function svgLines(lines,x,y,lineH,style){
  if(!lines.length)return '';
  return `<text>${lines.map((line,i)=>`<tspan x="${x}" y="${y+i*lineH}" style="${style}">${esc(line)}</tspan>`).join('')}</text>`;
}
function positionCardSVG(n,{x=0,y=0,interactive=false,hit=false,children=0,expanded=false,change='unchanged',peopleCount=null,span=null,selected=false,onPath=false}={}){
  const metrics=n._lines||cardMetrics(n,cardDisplay),w=n._w||metrics.width,h=n._h||metrics.height,d=cardDisplay;
  const [bf,bi,sf,si]=badge(n.type,n.status),vacant=n.hiringState!=='Filled';
  const ink=cssVar('--ink'),muted=cssVar('--muted'),panel=cssVar('--panel'),line=cssVar('--line'),accent=cssVar('--accent');
  const changeColor=change==='added'?cssVar('--good'):change==='changed'?cssVar('--warn'):null;
  const label=personLabel(n);
  const initials=vacant?'+':label.split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  const roleW=Math.min(110,Math.max(51,n.type.length*5.3+16)),stateColor=n.hiringState==='Recruiting'?cssVar('--warn'):vacant?muted:cssVar('--good');
  const inlineName=`font:750 13px Arial,sans-serif;fill:${ink}`,inlineRole=`font:500 10px Arial,sans-serif;fill:${muted}`,inlineMeta=`font:600 9px Arial,sans-serif;fill:${muted}`,inlineBadge='font:700 8.5px Arial,sans-serif';
  const clipId=`ph-${String(n.id).replace(/[^a-zA-Z0-9_-]/g,'_')}`;
  const photo=n.photo?.data?`<defs><clipPath id="${clipId}"><circle cx="28" cy="32" r="15"/></clipPath></defs><image href="${esc(n.photo.data)}" xlink:href="${esc(n.photo.data)}" x="13" y="17" width="30" height="30" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`:`<circle cx="28" cy="32" r="15" fill="${vacant?cssVar('--panel-3'):bf}"/><text x="28" y="36" text-anchor="middle" fill="${vacant?muted:bi}" style="${inlineBadge}${vacant?';font-size:16px':''}">${esc(initials)}</text>`;
  let cursorY=14+Math.max(metrics.nameLines.length*15,30);
  const nameSvg=svgLines(metrics.nameLines,50,27,15,inlineName);
  cursorY+=4;
  const titleSvg=svgLines(metrics.titleLines,13,cursorY+10,13,inlineRole);
  cursorY+=metrics.titleLines.length*13;
  let body='';
  if(metrics.groupLines.length){body+=svgLines(metrics.groupLines,13,cursorY+11,13,inlineMeta);cursorY+=metrics.groupLines.length*13;}
  if(metrics.siteLines.length){body+=svgLines(metrics.siteLines,13,cursorY+11,13,inlineMeta);cursorY+=metrics.siteLines.length*13;}
  let badges='';
  if(d.type||d.approval){
    const badgeY=cursorY+4;
    if(d.type)badges+=`<rect x="12" y="${badgeY}" width="${roleW}" height="16" rx="5" fill="${bf}"/><text x="${12+roleW/2}" y="${badgeY+11}" text-anchor="middle" fill="${bi}" style="${inlineBadge}">${esc(n.type)}</text>`;
    if(d.approval)badges+=`<rect x="${w-92}" y="${badgeY}" width="80" height="16" rx="5" fill="${sf}"/><text x="${w-52}" y="${badgeY+11}" text-anchor="middle" fill="${si}" style="${inlineBadge}">${n.status==='Approved'?'Approved':'Unapproved'}</text>`;
  }
  let foot='';
  const footPrimary=d.hiring||d.fte||(d.cumulative&&peopleCount!=null);
  if(footPrimary){
    const fy=h-(d.span?24:10);
    if(d.hiring)foot+=`<circle cx="16" cy="${fy-3}" r="2.5" fill="${stateColor}"/><text x="23" y="${fy}" fill="${stateColor}" style="font:650 9px Arial,sans-serif">${esc(n.hiringState)}</text>`;
    const right=[];
    if(d.cumulative&&peopleCount!=null)right.push(`${peopleCount} ${peopleCount===1?'person':'people'}`);
    if(d.fte)right.push(`${fteText(n.fte)} FTE`);
    if(right.length)foot+=`<text x="${w-12}" y="${fy}" text-anchor="end" style="${inlineMeta}">${esc(right.join(' · '))}</text>`;
  }
  if(d.span&&span&&(span.reports||span.vacant)){
    const label=`${span.reports} ${span.reports===1?'report':'reports'} · ${span.vacant} open`;
    foot+=`<text x="13" y="${h-10}" fill="${ink}" style="font:700 10px Arial,sans-serif">${esc(label)}</text>`;
  }
  const nodeClass=[interactive?'node':'',hit?'search-hit':'',selected?'selected':'',onPath?'on-path':''].filter(Boolean).join(' ');
  return `<g ${interactive?`class="${nodeClass}" data-id="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.title+', '+label+', '+n.hiringState+', '+n.status+'. Edit position.')}"`:''} transform="translate(${x},${y})">
    <title>${esc(n.title+' ['+n.id+']\n'+label+' · '+n.hiringState+' · '+n.status+'\n'+n.type+' · '+(n.group||'No group')+(n.location?' · '+n.location:'')+' · '+fteText(n.fte)+' FTE'+(peopleCount!=null?' · '+peopleCount+' in team':'')+(changeColor?'\n'+change.toUpperCase()+' vs original baseline':''))}</title>
    <rect ${interactive?'class="card"':''} width="${w}" height="${h}" rx="12" fill="${panel}" stroke="${hit?accent:changeColor||line}" stroke-width="${hit?2.5:1.2}" style="stroke:${hit?accent:changeColor||line};stroke-width:${hit?2.5:1.2}" ${vacant?'stroke-dasharray="5 3"':''}/>
    ${changeColor?`<rect x="16" y="-7" width="62" height="14" rx="4" fill="${changeColor}"/><text x="47" y="3" text-anchor="middle" fill="${cssVar('--bg')}" style="${inlineBadge};font-size:8px">${change.toUpperCase()}</text>`:''}
    ${photo}${nameSvg}${titleSvg}${body}${badges}${foot}
    ${interactive&&children?`<circle class="collapse-btn" cx="${w/2}" cy="${h+5}" r="10"/><circle class="collapse-hit" data-action="collapse" tabindex="0" role="button" aria-label="${expanded?'Collapse':'Expand'} team under ${esc(n.title)}" aria-expanded="${expanded}" cx="${w/2}" cy="${h+5}" r="16"/><text x="${w/2}" y="${h+8.5}" text-anchor="middle" class="collapseText">${expanded?'−':'+'}</text>`:''}
  </g>`;
}
function dottedConnectors(lay,offX,offY,stroke){
  const byId=new Map(lay.all.map(n=>[n.id,n]));let out='';
  for(const n of lay.all){
    const m=byId.get(n.secondaryManagerId);if(!m)continue;
    const mw=m._w||lay.cardW,mh=m._h||124,nw=n._w||lay.cardW,nh=n._h||124;
    const x1=m._x+offX+mw/2,y1=m._y+offY+mh/2,x2=n._x+offX+nw/2,y2=n._y+offY+nh/2,mid=(x1+x2)/2;
    out+=`<path class="dotted-connector" d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}" fill="none" stroke="${stroke||'currentColor'}" stroke-width="1.3" stroke-dasharray="5 4"/>`;
  }
  return out;
}
// Layout and derived counts are cached independently of selection, hover and scrolling.
// Full exports use buildExportSVG and are deliberately not viewport-clipped.
let chartModel=null,chartViewportFrame=0,lastChartSearch='',lastCardMarkup='';
function getChartModel(){
  const key=JSON.stringify([[...activeRoles],[...activeStatuses],[...activeHiring],[...(activeGroups||[])],[...(activeSites||[])],maxDepth,[...collapsed],cardDisplay,projectionDate,$('#dateFilter').checked,showChartChanges]);
  if(chartModel?.source===projectionSource&&chartModel.key===key)return chartModel;
  const full=buildFilteredForest(),forest=applyDepthAndCollapse(full),lay=layoutTree(forest),allFiltered=flatten(full,[]);
  const childCounts=new Map(allFiltered.map(n=>[n.id,n.children.length])),children=new Map(),spans=new Map(),counts=new Map();
  for(const p of people){if(!children.has(p.managerId))children.set(p.managerId,[]);children.get(p.managerId).push(p);}
  for(const p of people){const reports=children.get(p.id)||[];spans.set(p.id,{reports:reports.length,vacant:reports.filter(r=>r.hiringState!=='Filled').length});}
  function count(id){if(counts.has(id))return counts.get(id);const n=(children.get(id)||[]).reduce((total,p)=>total+(p.personId?1:0)+count(p.id),0);counts.set(id,n);return n;}
  if(cardDisplay.cumulative)for(const p of people)count(p.id);
  chartModel={source:projectionSource,key,lay,forest,childCounts,spans,counts,diffs:chartDiffMap(),byId:new Map(lay.all.map(n=>[n.id,n])),edgeKey:''};
  return chartModel;
}
function paintChartViewport(){
  if(currentView!=='chart'||!chartModel)return;
  const m=chartModel,lay=m.lay,search=$('#search').value.trim().toLowerCase();
  const svgRect=svg.getBoundingClientRect(),wrapRect=wrap.getBoundingClientRect(),over=220;
  const box={left:(wrapRect.left-svgRect.left)/zoom-m.offX-over,top:(wrapRect.top-svgRect.top)/zoom-m.offY-over,right:(wrapRect.right-svgRect.left)/zoom-m.offX+over,bottom:(wrapRect.bottom-svgRect.top)/zoom-m.offY+over};
  const focused=document.activeElement?.closest?.('.node'),focusId=focused?.dataset.id;
  const hits=search?lay.all.filter(n=>matchesSearch(n,search)):[];
  const hit=hits[0]||null;
  // Reveal the current match (and the focused card) even when they sit
  // outside the viewport clip. Do not force every hit into the DOM — a
  // broad query on a 2,500-seat chart would defeat virtualization.
  const reveal=new Set();
  if(hit)reveal.add(hit.id);
  if(focusId)reveal.add(focusId);
  if(selectedId&&hits.some(n=>n.id===selectedId))reveal.add(selectedId);
  const visible=lay.all.length<=300?lay.all:lay.all.filter(n=>reveal.has(n.id)||(n._x+n._w>=box.left&&n._x<=box.right&&n._y+n._h>=box.top&&n._y<=box.bottom));
  const pathIds=new Set(pathToRoot(people,pathHoverId||hit?.id));
  cssValueCache={};
  const markup=visible.map(n=>positionCardSVG(n,{x:n._x,y:n._y,interactive:true,hit:!!search&&matchesSearch(n,search),children:m.childCounts.get(n.id)||0,expanded:!!n.children.length,change:m.diffs.get(n.id),peopleCount:cardDisplay.cumulative&&showsCumulativeCount(n.type)?m.counts.get(n.id)+(n.personId?1:0):null,span:cardDisplay.span?m.spans.get(n.id):null,selected:selectedIds.has(n.id),onPath:pathIds.has(n.id)})).join('');
  cssValueCache=null;
  const cards=$('#viewportCards');
  if(cards&&markup!==lastCardMarkup){cards.innerHTML=markup;lastCardMarkup=markup;if(focusId)cards.querySelector(`[data-id="${CSS.escape(focusId)}"]`)?.focus({preventScroll:true});}
  applyPathClasses();
  $('#visibleCardsHint').textContent=`${visible.length} cards rendered · ${lay.all.length} in chart · ${$('#countVisible').textContent} matching positions. Use Positions for keyboard access to all seats. FTE totals ignore collapse and search.`;
}
function scheduleChartViewport(){if(chartViewportFrame)return;chartViewportFrame=requestAnimationFrame(()=>{chartViewportFrame=0;paintChartViewport();});}
wrap.addEventListener('scroll',scheduleChartViewport,{passive:true});
function render(){
  if(!workspace)return;
  syncProjection();renderPlanningHeader();syncChartDisplayUi();
  const t=totals({positions:people},p=>baseVisible(p));
  $('#countVisible').textContent=t.positions;$('#countTotal').textContent=t.filled;$('#countApproved').textContent=t.open;$('#countOpen').textContent=t.recruiting;$('#countFte').textContent=fteText(t.fte);$('#countApprovedFte').textContent=fteText(t.approvedFte);
  syncDateFilterUi();$('#zoomLabel').textContent=Math.round(zoom*100)+'%';renderFilterStrip();syncBulkBar();
  $('#empty').style.display='none';
  if(currentView==='chart'){
    const m=getChartModel(),lay=m.lay,search=$('#search').value.trim().toLowerCase();
    $('#empty').style.display=m.forest.length?'none':'grid';
    const filtersOn=activeFilterItems().length>0,emptyCard=$('#empty .empty-card');
    if(emptyCard){emptyCard.querySelector('h2').textContent=filtersOn?'No positions match these filters':'No positions in this scenario yet';emptyCard.querySelector('p').textContent=filtersOn?'Search, filter chips and the date filter are limiting the chart.':'Add a position, import a CSV, or load an example company.';$('#emptyClearFilters')?.classList.toggle('hidden',!filtersOn);}
    chartBounds={width:Math.max(350,lay.width+100),height:Math.max(250,lay.height+110)};
    const width=Math.max(chartBounds.width,(wrap.clientWidth-48)/zoom),height=Math.max(chartBounds.height,(wrap.clientHeight-48)/zoom),offX=(width-lay.width)/2,offY=32;
    m.offX=offX;m.offY=offY;
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('width',Math.ceil(width*zoom));svg.setAttribute('height',Math.ceil(height*zoom));svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
    const edgeKey=JSON.stringify([m.key,width,height,document.documentElement.dataset.theme,document.documentElement.dataset.palette]);
    if(m.edgeKey!==edgeKey||!$('#viewportCards')){
      cssValueCache={};svg.innerHTML=`<g transform="translate(${offX},${offY})">${(lay.connectors||[]).map(c=>`<path class="connector" data-from="${esc(c.fromId||'')}" data-to="${esc(c.toId||'')}" d="${c.d}"/>`).join('')}${dottedConnectors(lay,0,0)}</g><g id="viewportCards" transform="translate(${offX},${offY})"></g>`;cssValueCache=null;m.edgeKey=edgeKey;lastCardMarkup='';
    }
    if(search&&search!==lastChartSearch){const hit=lay.all.find(n=>matchesSearch(n,search));if(hit){const rect=svg.getBoundingClientRect(),wr=wrap.getBoundingClientRect();wrap.scrollLeft+=(hit._x+offX+hit._w/2)*zoom+rect.left-wr.left-wr.width/2;wrap.scrollTop+=(hit._y+offY+hit._h/2)*zoom+rect.top-wr.top-wr.height/2;}}
    lastChartSearch=search;paintChartViewport();
  }else if(currentView==='positions')renderPositionTable();
  else if(currentView==='compare')renderComparison();
  else if(currentView==='management')window.OrgFlowPlanningUI?.render();
  if($('#drawer').classList.contains('open')&&selectedId)updateOrderControls();
  rememberPlanningView();renderSaveStatus();
}

function reparentPosition(id,newManagerId){
  const s=activeScenario(),pos=s.positions.find(p=>p.id===id);if(!pos)return;
  if(pos.reportingMode==='timeline'){toast('Use Planning → Timeline to change dated reporting lines.');return;}
  if(pos.managerId===newManagerId){toast('Already reports there');return;}
  if(wouldCreateCycle(s.positions,id,newManagerId)){toast('That reporting line would create a cycle.');return;}
  try{updateScenario(sc=>{const p=sc.positions.find(x=>x.id===id);if(!p)return;p.managerId=newManagerId;if(p.secondaryManagerId===newManagerId)p.secondaryManagerId='';},'Reporting line updated');}
  catch(error){toast(error.message);}
}
function siblingDropPlace(ev,over,sourceId){
  const src=people.find(p=>p.id===sourceId),dst=people.find(p=>p.id===over.dataset.id);
  if(!src||!dst||src.id===dst.id)return null;
  if((src.managerId||'')!==(dst.managerId||''))return null;
  const rect=over.getBoundingClientRect();
  const manager=people.find(p=>p.id===src.managerId);
  const stacked=manager?nodeStacked({...manager,children:people.filter(p=>p.managerId===src.managerId).map(c=>({...c,children:[]}))}):false;
  const along=stacked?((ev.clientY-rect.top)/Math.max(1,rect.height)):((ev.clientX-rect.left)/Math.max(1,rect.width));
  return along<0.5?'before':'after';
}
function beginCardDrag(e,node){
  if(enterpriseBlocksWrite())return;
  if(e.button!==0||e.target.closest?.('[data-action="collapse"]')||e.target.closest?.('[data-select]'))return;
  if(e.shiftKey||e.metaKey||e.ctrlKey)return;
  const id=node.dataset.id,startX=e.clientX,startY=e.clientY;let moved=false;
  const clearTargets=()=>$$('.node').forEach(n=>n.classList.remove('drop-target','drop-before','drop-after'));
  const onMove=ev=>{
    if(!moved&&Math.hypot(ev.clientX-startX,ev.clientY-startY)<8)return;
    if(!moved){moved=true;node.classList.add('dragging');document.body.classList.add('reparenting');}
    clearTargets();
    const over=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('.node');
    if(!over||over.dataset.id===id)return;
    const place=siblingDropPlace(ev,over,id);
    if(place==='before')over.classList.add('drop-before');
    else if(place==='after')over.classList.add('drop-after');
    else over.classList.add('drop-target');
  };
  const onUp=ev=>{
    window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onUp);
    node.classList.remove('dragging');document.body.classList.remove('reparenting');
    const over=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('.node');
    const place=over?siblingDropPlace(ev,over,id):null;
    clearTargets();
    if(!moved)return;
    skipNodeClick=true;setTimeout(()=>{skipNodeClick=false;},0);
    if(!over||over.dataset.id===id){toast('Drop on a sibling to reorder, or on another manager to change reporting');return;}
    if(place){
      try{updateScenario(s=>{s.positions=placeSibling(s.positions,id,over.dataset.id,place);},'Reporting order updated');}
      catch(error){toast(error.message);}
      return;
    }
    reparentPosition(id,over.dataset.id);
  };
  window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp);
}
function setZoom(next){zoom=Math.max(.15,Math.min(1.75,next));render();}
function fitChart(){zoom=Math.max(.15,Math.min(1,(wrap.clientWidth-60)/chartBounds.width,(wrap.clientHeight-50)/chartBounds.height));render();centerChart();}
function buildExportSVG(filterGroup=null){
  const full=buildFilteredForest(),target=filterGroup?pruneToGroup(full,filterGroup):applyDepthAndCollapse(full);if(!target.length)return null;
  const lay=layoutTree(structuredClone(target)),brand=structuredClone(branding),branded=brand.includeExports;
  const w=Math.ceil(Math.max(lay.width+100,branded?740:450)),top=branded?150:55,offX=(w-lay.width)/2,offY=top,h=Math.ceil(lay.height+top+(branded?86:56));
  const bg=cssVar('--bg'),ink=cssVar('--ink'),muted=cssVar('--muted'),line=cssVar('--line'),connector=cssVar('--connector');
  const search=$('#search').value.trim().toLowerCase(),diffs=chartDiffMap();
  const peopleCounts=new Map();
  if(cardDisplay.cumulative){const allPos=activeScenario().positions;for(const n of lay.all)if(showsCumulativeCount(n.type))peopleCounts.set(n.id,subtreePeopleCount(allPos,n.id));}
  const xml=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${bg}"/>`];
  if(branded){
    const logo=logoForTheme(brand);let x=40;
    if(logo){const k=Math.min(128/logo.width,38/logo.height),lw=logo.width*k,lh=logo.height*k,surface=logo.surface==='light'?'#ffffff':logo.surface==='dark'?'#151515':null;
      if(surface)xml.push(`<rect x="34" y="20" width="${lw+12}" height="50" rx="5" fill="${surface}"/>`);
      xml.push(`<image x="40" y="${26+(38-lh)/2}" width="${lw}" height="${lh}" preserveAspectRatio="xMidYMid meet" xlink:href="${esc(logo.data)}"/>`);x=lw+62;}
    xml.push(`<text x="${x}" y="42" fill="${ink}" style="font:700 15px Arial,sans-serif">${esc(exportText(brand.companyName||'OrgFlow',Math.floor((w-x-60)/8)))}</text><text x="${x}" y="61" fill="${muted}" style="font:600 10px Arial,sans-serif">${esc(exportText(brand.chartTitle,Math.floor((w-x-60)/6)))}</text>`);
    const description=`${activeScenario().name} · ${filterGroup||'Organization tree'} · ${lay.all.length} positions${filterGroup?' incl. context':''}`,date=$('#dateFilter').checked&&$('#asOf').value?`As of ${fmtDate($('#asOf').value)}`:'All dates';
    xml.push(`<text x="40" y="99" fill="${muted}" style="font:600 11px Arial,sans-serif">${esc(exportText(description,Math.floor((w-260)/6)))}</text><text x="${w-40}" y="99" text-anchor="end" fill="${muted}" style="font:600 10px Arial,sans-serif">${esc(date)}</text><line x1="40" y1="122" x2="${w-40}" y2="122" stroke="${line}"/>`);
    xml.push(`<line x1="40" y1="${h-42}" x2="${w-40}" y2="${h-42}" stroke="${line}"/><text x="40" y="${h-22}" fill="${muted}" style="font:500 9px Arial,sans-serif">${esc(exportText(brand.footer,Math.floor((w-160)/5.5)))}</text><text x="${w-40}" y="${h-22}" text-anchor="end" fill="${muted}" style="font:600 9px Arial,sans-serif">OrgFlow</text>`);
  }else xml.push(`<text x="40" y="25" fill="${muted}" style="font:600 11px Arial,sans-serif">${esc(exportText(activeScenario().name+' · '+(filterGroup||'Organization tree'),80))}</text>`);
  for(const c of lay.connectors||[])xml.push(`<path d="${c.d}" transform="translate(${offX},${offY})" fill="none" stroke="${connector}" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="round"/>`);
  xml.push(dottedConnectors(lay,offX,offY,muted));
  for(const n of lay.all)xml.push(positionCardSVG(n,{x:n._x+offX,y:n._y+offY,hit:!!search&&matchesSearch(n,search),change:diffs.get(n.id),peopleCount:peopleCounts.has(n.id)?peopleCounts.get(n.id):null,span:cardDisplay.span?spanOfControl(activeScenario().positions,n.id):null}));
  xml.push('</svg>');return{xml:xml.join(''),width:w,height:h,nodeCount:lay.all.length};
}
function buildComparisonSVG(){
  const d=comparisonData(),changes=visibleChanges(d),a=totals(d.baseline),b=totals(d.target);
  const bg=cssVar('--bg'),panel=cssVar('--panel'),ink=cssVar('--ink'),muted=cssVar('--muted'),line=cssVar('--line'),accent=cssVar('--accent-ink');
  const width=1140;let y=300;const lines=[];
  for(const c of changes){const p=c.after||c.before,details=c.kind==='changed'?c.fields.map(f=>`${f.label}: ${fieldValue(f.key,f.before,d.baseline)} → ${fieldValue(f.key,f.after,d.target)}`):[`${p.hiringState} · ${p.status} · ${fteText(p.fte)} FTE · ${p.group||'No group'}`];
    const height=55+details.length*19;const color=c.kind==='added'?cssVar('--good'):c.kind==='removed'?cssVar('--bad'):c.kind==='changed'?cssVar('--warn'):muted;
    lines.push(`<rect x="34" y="${y}" width="1072" height="${height}" rx="9" fill="${panel}" stroke="${line}"/><text x="49" y="${y+25}" fill="${color}" style="font:700 10px Arial,sans-serif">${c.kind.toUpperCase()}</text><text x="132" y="${y+25}" fill="${ink}" style="font:700 13px Arial,sans-serif">${esc(exportText(p.title+' ['+c.id+']',115))}</text>`);
    details.forEach((t,i)=>lines.push(`<text x="132" y="${y+46+i*19}" fill="${muted}" style="font:500 10px Arial,sans-serif">${esc(exportText(t,157))}</text>`));y+=height+10;
  }
  if(!changes.length){lines.push(`<text x="40" y="330" fill="${muted}" style="font:500 13px Arial,sans-serif">No matching differences in this view.</text>`);y=355;}
  const height=y+60,xml=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${bg}"/>`];
  let titleX=36;
  if(branding.includeExports){const logo=logoForTheme(branding);if(logo){const k=Math.min(110/logo.width,36/logo.height),lw=logo.width*k,lh=logo.height*k,surface=logo.surface==='light'?'#fff':logo.surface==='dark'?'#151515':null;if(surface)xml.push(`<rect x="30" y="20" width="${lw+12}" height="48" rx="4" fill="${surface}"/>`);xml.push(`<image x="36" y="${27+(36-lh)/2}" width="${lw}" height="${lh}" xlink:href="${esc(logo.data)}"/>`);titleX=lw+58;}}
  xml.push(`<text x="${titleX}" y="43" fill="${ink}" style="font:700 16px Arial,sans-serif">${esc(exportText(branding.includeExports?(branding.companyName||'OrgFlow'):'OrgFlow',80))}</text><text x="36" y="102" fill="${ink}" style="font:700 27px Arial,sans-serif">Scenario comparison</text><text x="36" y="129" fill="${accent}" style="font:600 13px Arial,sans-serif">${esc(exportText((compareBaselineId==='__snapshot__'?'Original baseline: ':'')+d.baseline.name+' → '+d.target.name,115))}</text>`);
  [['positions','POSITIONS'],['filled','FILLED'],['open','OPEN'],['approvedFte','APPROVED FTE']].forEach(([key,label],i)=>{const x=36+i*274;xml.push(`<rect x="${x}" y="153" width="258" height="88" rx="9" fill="${panel}" stroke="${line}"/><text x="${x+15}" y="177" fill="${muted}" style="font:600 10px Arial,sans-serif">${label}</text><text x="${x+15}" y="214" fill="${ink}" style="font:700 25px Arial,sans-serif">${fteText(a[key])} → ${fteText(b[key])}</text>`);});
  xml.push(`<text x="36" y="273" fill="${muted}" style="font:500 11px Arial,sans-serif">Full snapshots · all dates · ${changes.length} matching positions · ${esc(exportText(compareKind+($('#compareSearch').value?' / '+$('#compareSearch').value:''),100))}</text>`,...lines,`<text x="36" y="${height-24}" fill="${muted}" style="font:500 10px Arial,sans-serif">${esc(exportText(branding.includeExports&&branding.footer?branding.footer:'Position capacity, not salary or attendance. Chart filters do not apply.',150))}</text></svg>`);
  return{xml:xml.join(''),width,height,nodeCount:changes.length};
}
async function exportComparisonPNG(){
  try{const blob=await pngFromExport(buildComparisonSVG());downloadBlob(blob,`comparison-${slug(comparisonData().target.name)}.png`);toast('Comparison PNG exported');}catch(error){toast(error.message);}
}

function exportCSV(){const s=activeScenario();downloadBlob(csvBlob(POSITION_CSV_COLUMNS,s.positions.map(p=>positionCSVValues(p,s))),`orgflow-${slug(s.name)}-positions.csv`);toast('Position snapshot exported. Use JSON backup to retain dated assignments, budgets and decisions.');}
function exportPeopleCSV(){const s=activeScenario();downloadBlob(csvBlob(['personId','name','employeeNumber','positionId'],s.employees.map(p=>[p.id,p.name,p.employeeNumber||'',s.positions.find(x=>x.personId===p.id)?.id||''])),`orgflow-${slug(s.name)}-people.csv`);}
function csvBlob(headers,rows){return new Blob([csvRows(headers,rows)],{type:'text/csv;charset=utf-8'});}
function downloadTemplate(){
  const rows=[['POS-001','','','Head of Product','Head','Product',1,'Approved','Filled','EMP-001','Alex Morgan','E-101','2026-01-01','','London','PRD','Product','0',''],['POS-002','POS-001','','Team Leader — Product Management','Team Leader','Product',1,'Approved','Filled','EMP-002','Sam Rivera','E-118','2026-01-01','','London','PRD','Product','0',''],['POS-003','POS-002','POS-001','Senior Product Manager','Specialist','Product',1,'Approved','Recruiting','','','','2027-01-01','','Remote','PRD','Product','1',''],['POS-004','POS-002','','Graduate Product Manager','Graduate','Product',0.8,'Not approved','Vacant','','','','2027-01-01','2027-12-31','London','PRD','Product','2','']];
  downloadBlob(csvBlob(POSITION_CSV_COLUMNS,rows),'orgflow-positions-template.csv');
}
const IMPORT_FIELD_LABELS={id:'Position ID',managerId:'Reports to · position ID',secondaryManagerId:'Dotted-line · position ID',managerName:'Reports to · name or title',personId:'Person ID',employeeNumber:'Employee number',name:'Person name',title:'Position title',type:'Position type',group:'Group / team',startDate:'Start date',endDate:'End date',status:'Approval',hiringState:'Hiring state',fte:'FTE',location:'Location / site',costCenter:'Cost center',jobFamily:'Job family',sortOrder:'Reporting order',stacked:'Stacked reports'};
let pendingImportText='',pendingImportName='',pendingImportOverrides={};
function prepareImport(text,fileName){return OrgFlow.prepareImport(text,fileName,activeScenario(),makeId,workspace.positionLevels,pendingImportOverrides);}
function makeImportScenario(result,mode){return OrgFlow.makeImportScenario(result,mode,activeScenario(),workspace.positionLevels);}
function renderImportMapping(result){
  const wrap=$('#importMapWrap');if(!wrap)return;
  if(!result.headers?.length){wrap.style.display='none';return;}
  wrap.style.display='';
  const fieldByCol=new Map(Object.entries(result.map||{}).map(([k,i])=>[i,k]));
  const ignored=result.headers.filter((_,i)=>!fieldByCol.has(i));
  $('#importMapSummary').textContent=`Column mapping${ignored.length?` · ${ignored.length} ignored`:''}`;
  wrap.open=ignored.length>0;
  $('#importMapGrid').innerHTML=result.headers.map((h,i)=>{
    const sel=fieldByCol.get(i)||'';
    const opts=`<option value="ignore"${sel?'':' selected'}>— Ignore —</option>`+Object.keys(IMPORT_FIELD_LABELS).map(k=>`<option value="${k}"${k===sel?' selected':''}>${esc(IMPORT_FIELD_LABELS[k])}</option>`).join('');
    return `<label class="map-row"><span title="${esc(h)}">${esc(h||'Column '+(i+1))}</span><select data-map-col="${i}">${opts}</select></label>`;
  }).join('');
}
function reimportWithMapping(){
  if(!pendingImportText)return;
  const overrides={};
  $$('#importMapGrid select[data-map-col]').forEach(s=>{overrides[s.dataset.mapCol]=s.value||'ignore';});
  pendingImportOverrides=overrides;
  try{pendingImport=prepareImport(pendingImportText,pendingImportName);}catch(error){toast(error.message);return;}
  renderImportReview();
}

function renderImportReview(){
  if(!pendingImport)return;const result=pendingImport,mode=$('input[name="importMode"]:checked').value,errors=[...result.errors];
  let preview=result.positions;
  if(!errors.length){try{const merged=makeImportScenario(result,mode);preview=result.positions.map(p=>merged.positions.find(x=>x.id===p.id));}catch(error){errors.push(error.message);}}
  $('#importFileName').textContent=`${result.filename||'CSV file'} → ${activeScenario().name}`;$('#impRows').textContent=result.positions.length;$('#impWarnings').textContent=result.warnings.length;$('#impErrors').textContent=errors.length;
  $('#importIssues').innerHTML=[...errors.map(x=>`<div class="issue error">${esc(x)}</div>`),...result.warnings.map(x=>`<div class="issue warn">${esc(x)}</div>`)].slice(0,40).join('');
  renderImportMapping(result);updateImportProfiles();
  $('#importPreview').innerHTML=preview.slice(0,10).map(p=>`<tr><td>${esc(p.id)}</td><td>${esc(p.title)}</td><td>${esc(result.employees.find(x=>x.id===p.personId)?.name||activeScenario().employees.find(x=>x.id===p.personId)?.name||'Unassigned')}</td><td>${esc(p.group)}</td><td>${esc(p.hiringState)}</td><td>${esc(p.status)}</td><td>${esc(p.fte)}</td><td>${esc(p.managerId||'Top level')}</td></tr>`).join('');
  $('#importConfirm').disabled=!!errors.length||!result.positions.length;$('#importConfirm').textContent=$('#importAsProposal').checked?`Create Draft · ${result.positions.length} positions`:`Update active scenario · ${result.positions.length} positions`;
}
function updateImportProfiles(){
  const select=$('#importProfileSelect'),keep=select.value;
  select.innerHTML='<option value="">No profile</option>'+(workspace.importProfiles||[]).map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');select.value=keep;
}
function openImportReview(result){
  pendingImport=result;
  const scoped=Boolean(window.OrgFlowEnterprise?.enabled&&window.OrgFlowEnterprise.session?.scopePositionId);
  $('#importAsProposal').checked=!scoped;$('#importAsProposal').disabled=scoped;$('#saveImportProfile').disabled=scoped;
  updateImportProfiles();renderImportReview();openDialog('importModal');
}
async function importFile(file){
  try{
    if(enterpriseBlocksWrite())throw new Error('Import is not available while a save is pending or for this role.');
    if(drawerIsDirty()&&!confirm('Discard unsaved position edits before importing?'))return;hidePositionEditor();
    if(file.size>5*1024*1024)throw new Error('CSV exceeds the 5 MB import limit.');
    pendingImportText=await file.text();pendingImportName=file.name;pendingImportOverrides={};
    openImportReview(prepareImport(pendingImportText,pendingImportName));
  }catch(error){pendingImportText='';pendingImportName='';pendingImportOverrides={};openImportReview({positions:[],employees:[],errors:[error.message||'Could not read this CSV.'],warnings:[],filename:file.name,scenarioId:workspace.activeScenarioId});}
}
async function confirmImport(){
  if(!pendingImport||pendingImport.errors.length)return;
  try{
    const mode=$('input[name="importMode"]:checked').value,nextScenario=makeImportScenario(pendingImport,mode);
    const asProposal=$('#importAsProposal').checked;
    if(!asProposal&&mode==='replace'&&activeScenario().positions.length&&!confirm(`Replace all ${activeScenario().positions.length} positions in “${activeScenario().name}” with ${pendingImport.positions.length} imported positions?\n\nOther scenarios and company branding will not change. People records are retained for reassignment. The current workspace is checkpointed first.`))return;
    if(!asProposal&&mode==='replace')await checkpointWorkspace('Before replacing positions via CSV import');
    let next;
    if(asProposal){
      const id=makeId('scenario'),name=(pendingImport.filename||'Imported proposal').replace(/\.csv$/i,'').slice(0,55)+' · '+makeId('').slice(-6);
      next=OrgFlowManagement.createProposal(workspace,{id,name,sourceId:workspace.activeScenarioId,rationale:`Review source import: ${pendingImport.filename||'CSV'}.`});
      Object.assign(next.scenarios.at(-1),OrgFlowManagement.snapshot(nextScenario));
    }else{next=structuredClone(workspace);const index=next.scenarios.findIndex(s=>s.id===workspace.activeScenarioId);next.scenarios[index]={...nextScenario,updatedAt:new Date().toISOString()};}
    commitPlanning(next,asProposal?'CSV imported as a Draft proposal; source unchanged.':`${pendingImport.positions.length} positions imported into ${activeScenario().name}`);selectedIds.clear();
    hidePositionEditor();collapsed.clear();setupChips();closeDialog('importModal');pendingImport=null;pendingImportText='';pendingImportName='';pendingImportOverrides={};render();
  }catch(error){$('#importIssues').innerHTML=`<div class="issue error">${esc(error.message)}</div>`;}
}
function exportComparisonCSV(){
  const d=comparisonData(),rows=[];
  for(const c of visibleChanges(d)){
    const fields=c.kind==='changed'?c.fields:DIFF_FIELDS.map(([key,label])=>({key,label,before:c.before?.[key],after:c.after?.[key]}));
    for(const f of fields)rows.push([compareBaselineId==='__snapshot__'?'Original baseline: '+d.baseline.name:d.baseline.name,d.target.name,c.kind,c.id,(c.after||c.before).title,f.label,c.before?fieldValue(f.key,f.before,d.baseline):'',c.after?fieldValue(f.key,f.after,d.target):'']);
  }
  downloadBlob(csvBlob(['baseline','target','change','positionId','title','field','before','after'],rows),`comparison-${slug(d.target.name)}.csv`);toast('Comparison CSV exported');
}

function captureView(){return {roles:[...activeRoles],statuses:[...activeStatuses],hiring:[...activeHiring],groups:[...(activeGroups||[])],sites:[...(activeSites||[])],maxDepth,collapsed:[...collapsed],search:$('#search').value,asOf:$('#asOf').value,dateFilter:$('#dateFilter').checked,view:currentView,zoom,showChartChanges,compareBaselineId,compareTargetId,compareKind,compareSearch:$('#compareSearch').value,cardDisplay};}
function workspacePayload(){
  return {format:'orgflow.workspace',version:DOCUMENT_VERSION,exportedAt:new Date().toISOString(),planning:workspace,branding,theme:document.documentElement.dataset.theme,palette:document.documentElement.dataset.palette,view:captureView()};
}
function exportWorkspace(){
  downloadBlob(new Blob([JSON.stringify(workspacePayload(),null,2)],{type:'application/json'}),`orgflow-workspace-${today}.json`);toast('All scenarios, people, views and branding backed up');
}
async function exportOrgflowBundle(){
  const checkpoints=await OrgFlowStore.listCheckpoints();
  const full=[];
  for(const c of checkpoints.slice(0,25)){
    const row=await OrgFlowStore.readCheckpoint(c.id);
    if(row?.planning)full.push(row);
  }
  const bundle=buildBundle({workspace:workspacePayload(),checkpoints:full});
  downloadBlob(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}),`orgflow-${today}.orgflow`);
  toast(`OrgFlow bundle exported — workspace plus ${full.length} checkpoint(s)`);
}
function sanitizeView(view={},planning=workspace){
  return sanitizeViewState(view,planning,today);
}
async function validateWorkspace(input){
  const parsed=parseWorkspaceOrBundle(input);
  const envelope=parsed.workspace;
  if(![1,2,3].includes(envelope.version))throw new Error('This is not a supported OrgFlow workspace backup. Use Import CSV for spreadsheets.');
  const planning=validatePlanning(envelope.version===1?migrateLegacy(envelope.people):envelope.planning),b=cleanBranding(envelope.branding);
  for(const key of ['logo','darkLogo']){
    const original=envelope.branding?.[key];if(original&&!validStoredLogo(original))throw new Error('Workspace contains an invalid logo.');
    if(b[key]){const encoded=b[key],raw=atob(encoded.data.split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const checked=await normalizeLogoFile(new File([bytes],encoded.name,{type:'image/png'}));checked.surface=encoded.surface;b[key]=checked;}
  }
  return {planning,branding:b,theme:envelope.theme==='dark'?'dark':'light',palette:PALETTES.includes(envelope.palette)?envelope.palette:(envelope.palette==='audi'?'crimson':'indigo'),view:sanitizeView(envelope.view||{},planning),checkpoints:parsed.checkpoints,kind:parsed.kind};
}
function restoreView(input){
  knownGroups=null;knownSites=null;
  const view=sanitizeView(input);activeRoles=new Set(view.roles);activeStatuses=new Set(view.statuses);activeHiring=new Set(view.hiring);
  activeGroups=new Set(view.groups);activeSites=new Set(view.sites);
  maxDepth=view.maxDepth;collapsed=new Set(view.collapsed);zoom=view.zoom;showChartChanges=view.showChartChanges;
  currentView=view.view;compareBaselineId=view.compareBaselineId;compareTargetId=view.compareTargetId;compareKind=view.compareKind;cardDisplay=view.cardDisplay;
  $('#search').value=view.search;$('#dateFilter').checked=view.dateFilter;$('#asOf').value=view.dateFilter?view.asOf:today;$('#compareSearch').value=view.compareSearch;setupChips();
  $$('#depthSeg button').forEach(b=>b.classList.toggle('active',+b.dataset.depth===maxDepth));
  syncChartDisplayUi();
}
function loadSavedPlanningView(){try{const raw=appStorage.getItem('orgflow.planning.view.v2');if(raw)restoreView(JSON.parse(raw));}catch{}}
function renderNamedViews(){
  const sel=$('#namedViewSelect');if(!sel)return;
  const views=workspace?.namedViews||[];
  const current=sel.value;
  sel.innerHTML='<option value="">— Current view —</option>'+views.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
  if(views.some(v=>v.id===current))sel.value=current;
}
function saveNamedView(){
  const name=$('#namedViewName')?.value.trim();if(!name){$('#namedViewName')?.focus();return;}
  try{
    const next=structuredClone(workspace);
    const views=next.namedViews||[];
    const existing=views.find(v=>v.name.toLowerCase()===name.toLowerCase());
    const snapshot=captureView();
    if(existing)existing.view=snapshot;
    else next.namedViews=[...views,{id:makeId('view'),name,view:snapshot}];
    commitPlanning(next,existing?`Updated view ${name}`:`Saved view ${name}`);
    if($('#namedViewName'))$('#namedViewName').value='';
    renderNamedViews();
    const saved=(workspace.namedViews||[]).find(v=>v.name.toLowerCase()===name.toLowerCase());
    if(saved&&$('#namedViewSelect'))$('#namedViewSelect').value=saved.id;
    toast(`Saved view ${name}`);
  }catch(error){toast(error.message);}
}
function applyNamedView(){
  const id=$('#namedViewSelect')?.value;if(!id)return;
  const found=(workspace.namedViews||[]).find(v=>v.id===id);if(!found)return;
  restoreView(found.view);setView(found.view.view);render();centerChart();toast(`Applied ${found.name}${activeDateNote()}`);
}
function deleteNamedView(){
  const id=$('#namedViewSelect')?.value;if(!id){toast('Choose a saved view to delete');return;}
  const found=(workspace.namedViews||[]).find(v=>v.id===id);
  try{
    const next=structuredClone(workspace);
    next.namedViews=(next.namedViews||[]).filter(v=>v.id!==id);
    commitPlanning(next,'Removed saved view');
    renderNamedViews();toast(found?`Removed ${found.name}`:'Removed saved view');
  }catch(error){toast(error.message);}
}
function syncBulkBar(){
  const bar=$('#bulkBar');if(!bar)return;
  const n=selectedIds.size;
  bar.hidden=n===0;
  wrap?.classList.toggle('has-bulk',n>0);
  if($('#bulkCount'))$('#bulkCount').textContent=`${n} selected`;
  const typeSel=$('#bulkType');
  if(typeSel){
    const keep=typeSel.value;
    typeSel.innerHTML='<option value="">Keep type</option>'+allPositionTypes().map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
    typeSel.value=[...typeSel.options].some(o=>o.value===keep)?keep:'';
  }
  const statusSel=$('#bulkStatus');
  if(statusSel&&!statusSel.querySelector('option[value=""]')){statusSel.insertAdjacentHTML('afterbegin','<option value="">Keep approval</option>');statusSel.value='';}
}
function resetBulkFields(){for(const el of $$('#bulkFields input,#bulkFields select')){if(el.dataset.bulkOperation)el.value='keep';else if(el.type==='checkbox')el.checked=false;else el.value='';}$('#bulkPreview')?.replaceChildren();window.OrgFlowPlanningUI?.previewBulk();}
function clearSelection(){selectedIds=new Set();resetBulkFields();render();}
function toggleSelected(id,additive=true){
  if(!additive)selectedIds=new Set();
  if(selectedIds.has(id)&&additive)selectedIds.delete(id);else selectedIds.add(id);
  render();
}
function applyBulkEdit(){window.OrgFlowPlanningUI?.applyBulk();}

function applyPathClasses(){
  const q=$('#search')?.value.trim().toLowerCase()||'';
  const hit=q?people.find(p=>baseVisible(p)&&matchesSearch(p,q)):null;
  const path=new Set(pathToRoot(people,pathHoverId||hit?.id));
  $$('#chart .node').forEach(n=>{
    n.classList.toggle('on-path',path.has(n.dataset.id));
    n.classList.toggle('path-dim',path.size>1&&!path.has(n.dataset.id));
  });
  $$('#chart .connector').forEach(c=>{
    const from=c.dataset.from,to=c.dataset.to;
    c.classList.toggle('on-path',path.size>1&&path.has(from)&&(!to||path.has(to)));
  });
}
async function saveWorkspaceToDisk(saveAs=false){
  if(documentOperationBusy||workspaceIOBusy)return;
  if(!await allowEnterpriseExport('workspace'))return;
  documentOperationBusy=true;
  try{
    if(fileHandleNeedsReconnect&&!saveAs){await reconnectSavedFile();if(fileHandleNeedsReconnect)return;}
    let candidate=workspaceFileHandle;
    if(window.orgflowDesktop?.saveDocumentAs&&(saveAs||!candidate)){
      const picked=await window.orgflowDesktop.saveDocumentAs();if(!picked)return;candidate=nativeDocumentHandle(picked);
    }
    if(!window.orgflowDesktop&&window.showSaveFilePicker&&(saveAs||!candidate))candidate=await window.showSaveFilePicker({suggestedName:`orgflow-workspace-${today}.json`,types:[{description:'OrgFlow workspace',accept:{'application/json':['.json']}}]});
    if(candidate?.createWritable){
      const savedRevision=filePersistence.revision;
      await filePersistence.save({handle:candidate});
      if(candidate!==workspaceFileHandle){workspaceFileHandle=candidate;fileHandleNeedsReconnect=false;await rememberFileHandle(candidate);filePersistence.setTarget(candidate,{saved:savedRevision===filePersistence.revision});syncAutosaveUi();}
      await refreshRecentFiles();renderSaveStatus();toast('Workspace saved');return;
    }
    downloadBlob(new Blob([JSON.stringify(workspacePayload(),null,2)],{type:'application/json'}),`orgflow-workspace-${today}.json`);
    toast('Backup downloaded. This browser cannot keep a file linked.');
  }catch(error){if(error?.name!=='AbortError'){toast(error.message||'Save failed. Your previous file link is unchanged.');renderSaveStatus();}}finally{documentOperationBusy=false;}
}
function nativeDocumentHandle(picked){
  return {
    name:picked.name, nativeToken:picked.token,
    async getFile(){const text=await window.orgflowDesktop.readDocument(picked.token);return new File([text],picked.name,{type:'application/json'});},
    async createWritable(){let text='';return {async write(blob){text=await blob.text();},async close(){await window.orgflowDesktop.writeDocument(picked.token,text);},async abort(){text='';}};}
  };
}
async function rememberFileHandle(handle){
  if(handle?.nativeToken){await OrgFlowStore.clearHandle();await window.orgflowDesktop.rememberDocument(handle.nativeToken);}
  else if(handle)await OrgFlowStore.putHandle(handle,handle.name||'',workspace.workspaceId);
  else await OrgFlowStore.clearHandle();
}
async function refreshRecentFiles(){
  if(!window.orgflowDesktop?.recentDocuments)return;
  const rows=await window.orgflowDesktop.recentDocuments();
  $('#recentFilesRow').hidden=!rows.length;
  $('#recentFiles').innerHTML='<option value="">Choose a file…</option>'+rows.map(r=>`<option value="${r.index}">${esc(r.name)} — ${esc(r.location)}</option>`).join('');
}
async function restoreWorkspacePicker(recentIndex=null){
  if(documentOperationBusy||workspaceIOBusy)return;
  if(enterpriseBlocksWrite()){toast('You can view this organization but you cannot restore over it.');return;}
  documentOperationBusy=true;
  try{
    if(window.orgflowDesktop?.openDocument){
      const picked=recentIndex===null?await window.orgflowDesktop.openDocument():await window.orgflowDesktop.openRecentDocument(recentIndex);
      if(picked){const handle=nativeDocumentHandle(picked);await restoreWorkspace(new File([picked.text],picked.name,{type:'application/json'}),handle);}
    }else if(window.showOpenFilePicker){
      const [handle]=await window.showOpenFilePicker({types:[{description:'OrgFlow workspace',accept:{'application/json':['.json','.orgflow']}}]});
      await restoreWorkspace(await handle.getFile(),handle);
    }else{$('#restoreInput').value='';$('#restoreInput').click();}
  }catch(error){if(error?.name!=='AbortError')toast(error.message||'Could not open the workspace.');}
  finally{documentOperationBusy=false;}
}
async function exportA3Pages(){
  const art=buildExportSVG();if(!art){toast('Nothing to export');return;}
  try{
    toast('Preparing A3 pages…');
    const blob=await pngFromExport(art),image=await readImage(blob);
    const A3W=1191,A3H=842,margin=36,header=40,usableW=A3W-margin*2,usableH=A3H-margin*2-header;
    const tiles=tileChartPages(image.naturalWidth,image.naturalHeight,usableW,usableH,0);
    const pages=[];
    for(const tile of tiles){
      const canvas=document.createElement('canvas');canvas.width=usableW;canvas.height=usableH+header;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF export is not supported by this browser.');
      ctx.fillStyle=cssVar('--bg')||'#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle=cssVar('--ink')||'#0f172a';ctx.font='600 16px Arial,sans-serif';
      ctx.fillText(`${exportText(branding.companyName||'OrgFlow',40)} · ${exportText(activeScenario().name,30)} · A3 page ${tile.page}/${tile.total}`,0,26);
      ctx.drawImage(image,tile.x,tile.y,tile.usableW,tile.usableH,0,header,usableW,usableH);
      const jpeg=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('JPEG generation failed.')),'image/jpeg',0.86));
      pages.push({jpeg:new Uint8Array(await jpeg.arrayBuffer()),width:canvas.width,height:canvas.height});
    }
    downloadBlob(makeJpegPdf(pages,A3W,A3H),`orgflow-a3-${today}.pdf`);
    toast(pages.length===1?'Exported one A3 page':`Exported ${pages.length} A3 pages`);
  }catch(error){toast(error.message||'A3 export failed');}
}
function printChartView(){
  setView('chart');
  setTimeout(()=>window.print(),50);
}
async function restoreWorkspace(file,candidateHandle=null){
  if(!file)return false;try{
    if(enterpriseBlocksWrite())throw new Error('You cannot restore this organization.');
    if(window.OrgFlowEnterprise?.enabled)throw new Error('Full JSON restoration is a local-workspace operation. Open a local planner to restore a backup; import a Draft proposal to change the shared organization without overwriting decision records.');
    if(file.size>12*1024*1024)throw new Error('Workspace file is too large (12 MB maximum).');let raw;try{raw=JSON.parse(await file.text());}catch{throw new Error('This file is not valid JSON.');}
    const next=await validateWorkspace(raw),count=next.planning.scenarios.length;
    next.planning=touchWorkspace({...next.planning,revision:next.planning.workspaceId===workspace?.workspaceId?Math.max(next.planning.revision||0,workspace.revision||0):next.planning.revision});
    if(!confirm(`Open “${next.branding.companyName||'OrgFlow'} / ${next.branding.chartTitle}” with ${count} scenario(s)?\n\nThis replaces ALL current scenarios, people, logos, palette and view. The current workspace is checkpointed first and can be recovered from Recovery & backups. Older v1 backups become a Current scenario.`))return;
    // Import recovery entries before replacing the active document. Keep the
    // displaced workspace as the newest checkpoint even at the retention cap.
    for(const ck of next.checkpoints||[]){
      if(!ck?.planning)continue;
      const checked=await validateWorkspace({format:'orgflow.workspace',version:3,...ck});
      await OrgFlowStore.addCheckpoint(checked.planning,ck.note||'Imported checkpoint',checked);
    }
    await checkpointWorkspace('Before restoring a workspace backup');
    workspaceIOBusy=true;clearTimeout(savedViewTimer);filePersistence.cancelPending();await filePersistence.idle();
    await OrgFlowStore.writeDocument({...workspacePayload(),...next,planning:next.planning});
    const entries={[BRANDING_KEY]:JSON.stringify(next.branding),'orgflow.theme':next.theme,'orgflow.palette':next.palette,'orgflow.planning.view.v2':JSON.stringify(next.view),[PLANNING_KEY]:JSON.stringify(next.planning)};
    for(const [key,value] of Object.entries(entries))safePreference(key,value);
    workspace=next.planning;lastSavedPlanningText=JSON.stringify(workspace);branding=next.branding;modelLoadError='';$('#loadError').classList.add('hidden');undoStack=[];redoStack=[];updateUndoButtons();syncProjection();hidePositionEditor();setPalette(next.palette,false);setTheme(next.theme,false);restoreView(next.view);applyBranding();writeDurable(workspace,lastSavedPlanningText);
    render();centerChart();toast(next.kind==='bundle'?`Restored bundle · ${count} scenario(s) · ${next.checkpoints.length} checkpoint(s)`:`Restored ${count} scenario(s)${activeDateNote()}`);filePersistence.changed();workspaceFileHandle=candidateHandle;fileHandleNeedsReconnect=false;await rememberFileHandle(candidateHandle);await refreshRecentFiles();filePersistence.setTarget(candidateHandle,{saved:!!candidateHandle});syncAutosaveUi();afterEnterprisePersist();return true;
  }catch(error){alert(`Workspace not restored.\n\n${error.message||'The file could not be read.'}`);return false;}finally{workspaceIOBusy=false;renderSaveStatus();}
}
function safeGet(key){try{return appStorage.getItem(key);}catch{return null;}}
function safePreference(key,value){try{appStorage.setItem(key,value);}catch{if(key===PLANNING_KEY)try{appStorage.removeItem(key);}catch{}}}


function applySampleChrome(sampleId, persist=true){
  const sample=ORGFLOW_EXAMPLES[sampleId]; if(!sample)return;
  const nextBrand=cleanBranding(sample.branding);
  if(persist){
    try{appStorage.setItem(BRANDING_KEY,JSON.stringify(nextBrand));appStorage.setItem('orgflow.theme',sample.theme);appStorage.setItem('orgflow.palette',sample.palette);appStorage.setItem('orgflow.sampleId',sampleId);}catch{}
  }
  branding=nextBrand; applyBranding(); setPalette(sample.palette,false); setTheme(sample.theme,false);
}
function replaceWorkspace(next,{brandingNext=null,palette='indigo',theme='light',view=null,sampleId='',message=''}={}){
  if(enterpriseBlocksWrite())throw new Error('You can view this organization but you cannot replace it.');
  if(window.OrgFlowEnterprise?.enabled)throw new Error('Examples and full replacements belong in a local workspace. Import a Draft proposal to preserve the shared organization and its decision history.');
  const previous=lastSavedPlanningText,checked=validatePlanning(touchWorkspace(next)),serialized=JSON.stringify(checked);
  safePreference(PLANNING_KEY,serialized);
  lastSavedPlanningText=serialized;workspace=checked;modelLoadError='';$('#loadError').classList.add('hidden');
  recordUndoFrom(previous,message||'Loaded workspace');
  if(brandingNext){
    branding=cleanBranding(brandingNext);
    try{appStorage.setItem(BRANDING_KEY,JSON.stringify(branding));if(sampleId)appStorage.setItem('orgflow.sampleId',sampleId);}catch{}
    applyBranding();
  }
  setPalette(palette,false);setTheme(theme,false);
  writeDurable(checked,serialized);
  syncProjection();
  if(view)restoreView(view);else applyDefaultFilters();
  hidePositionEditor();render();centerChart();updateUndoButtons();
  const aside=document.querySelector('aside');if(aside)aside.scrollTop=0;
  afterWorkspaceMutation();
}
async function loadSampleWorkspace(sampleId,{empty=false,skipConfirm=false}={}){
  if(modelLoadError){toast('Restore your workspace before loading an example.');return;}
  const label=empty?'a blank organization':(ORGFLOW_EXAMPLES[sampleId]?.branding?.companyName||'this example');
  if(!skipConfirm&&!confirm(`Replace the current workspace with ${label}?\n\nThis overwrites scenarios, people and branding in this browser. The current workspace is checkpointed first and stays recoverable under Recovery & backups.`))return;
  try{
    await checkpointWorkspace(`Before loading ${empty?'a blank organization':'an example'}`);
    if(empty){
      replaceWorkspace(emptyWorkspace(today),{brandingNext:BRANDING_DEFAULTS,palette:'indigo',theme:window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light',message:'Blank organization'});
      try{appStorage.removeItem('orgflow.sampleId');}catch{}
      toast('Started from a blank organization');
    }else{
      const sample=ORGFLOW_EXAMPLES[sampleId];
      replaceWorkspace(sample.planning,{brandingNext:sample.branding,palette:sample.palette,theme:sample.theme,view:sample.view||{},sampleId,message:`Loaded ${sample.branding.companyName}`});
      toast(`Loaded ${sample.branding.companyName}${activeDateNote()}`);
    }
  }catch(error){toast(error.message||'Could not load the example.');}
}
async function loadStarterTemplate(id,{skipConfirm=false}={}){
  const t=typeof ORGFLOW_TEMPLATES==='undefined'?null:ORGFLOW_TEMPLATES[id];
  if(!t){toast('Template was not found.');return;}
  if(modelLoadError){toast('Restore your workspace before loading a template.');return;}
  if(!skipConfirm&&!confirm(`Replace the current workspace with ${t.branding.companyName}?\n\nThis overwrites scenarios, people and branding in this browser. The current workspace is checkpointed first.`))return;
  try{
    await checkpointWorkspace('Before loading a template');
    replaceWorkspace(t.planning,{brandingNext:t.branding,palette:t.palette||'indigo',theme:'light',message:`Loaded ${t.branding.companyName}`});
    toast(`Loaded ${t.branding.companyName}${activeDateNote()}`);
  }catch(error){toast(error.message||'Could not load the template.');}
}
function markWelcomeSeen(){try{appStorage.setItem(WELCOME_KEY,'1');}catch{}}
function closeWelcome(){markWelcomeSeen();welcomeFirstRun=false;closeDialog('welcomeModal');}
function populateTemplateGrid(){
  const host=$('#templateGrid');if(!host)return;
  const items=[
    {kind:'example',id:'harbor-and-co',name:'Harbor & Co',blurb:'Product company · 17 positions'},
    {kind:'example',id:'northstar-commerce',name:'Northstar Commerce',blurb:'Retail operations · 14 positions'},
    ...Object.entries(typeof ORGFLOW_TEMPLATES==='undefined'?{}:ORGFLOW_TEMPLATES).map(([id,t])=>({kind:'template',id,name:t.branding.companyName,blurb:t.label+' · '+t.blurb}))
  ];
  host.innerHTML=items.map(item=>`<button type="button" class="template-card" data-kind="${item.kind}" data-id="${esc(item.id)}"><b>${esc(item.name)}</b><small>${esc(item.blurb)}</small></button>`).join('');
}
function openWelcome(force=false){
  populateTemplateGrid();
  openDialog('welcomeModal');
  if(force)markWelcomeSeen();
}
function maybeShowWelcome(){
  try{if(appStorage.getItem(WELCOME_KEY))return;}catch{return;}
  welcomeFirstRun=true;
  openWelcome();
}
function renderHistory(){
  let list=[];try{list=JSON.parse(appStorage.getItem(HISTORY_KEY)||'[]');}catch{list=[];}
  $('#historyRows').innerHTML=list.length?list.map((item,i)=>`<tr><td>${esc(item.at?.replace('T',' ').slice(0,19)||'')}</td><td>${esc(item.note||'Saved')}</td><td><button class="btn compact-btn" data-history="${i}">Restore</button></td></tr>`).join(''):'<tr><td colspan="3" class="empty-row">No earlier versions in this browser yet. Edits create snapshots automatically.</td></tr>';
}
function recoveryLocationText(){
  const places=['browser storage'];
  if(OrgFlowStore.supported)places.push('app storage');
  if(window.orgflowDesktop?.storagePath)places.push(window.orgflowDesktop.storagePath());
  return places.join(' · ');
}
async function renderRecovery(){
  const s=workspace,stamp=workspaceStamp(s);
  const t=totals(activeScenario());
  const fileInfo=workspaceFileHandle?`Saved file: ${esc(workspaceFileHandle.name||'picked file')}${fileHandleNeedsReconnect?' · needs reconnect':''}`:'No saved file picked';
  $('#recoveryWorkspace').innerHTML=`<div class="meta-grid">`
    +`<div><span>Workspace</span><b>${esc(stamp.workspaceId||'—')}</b></div>`
    +`<div><span>Revision</span><b>${stamp.revision}</b></div>`
    +`<div><span>Last committed</span><b>${esc(stamp.lastCommittedAt?stamp.lastCommittedAt.replace('T',' ').slice(0,19):'—')}</b></div>`
    +`<div><span>Scenarios</span><b>${s.scenarios.length} · ${s.scenarios.filter(x=>x.archived).length} archived</b></div>`
    +`<div><span>Positions / people</span><b>${t.positions} / ${s.scenarios.find(x=>x.id===s.activeScenarioId).employees.length}</b></div>`
    +`<div><span>Stored in</span><b>${esc(recoveryLocationText())}</b></div>`
    +`<div><span>File</span><b>${fileInfo}</b></div>`
    +`</div>`;
  const pending=await OrgFlowStore.getPending();
  const pendBox=$('#recoveryPending');
  if(pending?.planning){
    pendBox.classList.remove('hidden');
    pendBox.innerHTML=`<div class="pending-box"><b>Recoverable changes</b> — edits saved ${esc(String(pending.savedAt||'').replace('T',' ').slice(0,19))} never reached the shared workspace.<div class="pending-actions"><button class="btn compact-btn" data-pending-restore>Review &amp; restore</button><button class="btn compact-btn" data-pending-discard>Discard</button></div></div>`;
  }else{pendBox.classList.add('hidden');pendBox.innerHTML='';}
  const legacyBox=$('#recoveryLegacy');
  if(legacyBox){
    let scan=null;try{scan=window.orgflowDesktop?.legacyProfiles?.();}catch{scan=null;}
    const rows=scan?.recovered||[], origins=scan?.origins||[];
    if(rows.length||origins.length){
      legacyBox.classList.remove('hidden');
      const originNote=origins.length?`<p class="hint">Found ${origins.length} leftover random-port browser origin(s) from an older desktop build. Recovered copies below were read from this profile's local storage.</p>`:'';
      legacyBox.innerHTML=`<div class="form-divider">Older desktop profile</div>${originNote}<div class="planning-table-wrap"><table class="planning-table"><thead><tr><th>Workspace</th><th>Revision</th><th></th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td class="title-cell">${esc(r.workspaceId||'—')}<span class="sub">${r.scenarios||0} scenario(s) · ${esc(String(r.lastCommittedAt||'').replace('T',' ').slice(0,19))}</span></td><td>${r.revision}</td><td><button class="btn compact-btn" data-legacy-restore="${r.index}">Restore as copy</button></td></tr>`).join(''):'<tr><td colspan="3" class="empty-row">Random-port origin folders are present, but no parseable workspace was found in Chromium local storage.</td></tr>'}</tbody></table></div>`;
    }else{legacyBox.classList.add('hidden');legacyBox.innerHTML='';}
  }
  const cps=await OrgFlowStore.listCheckpoints();
  $('#checkpointRows').innerHTML=cps.length?cps.map(c=>{
    const m=c.summary||{};
    return `<tr><td>${esc(String(c.at||'').replace('T',' ').slice(0,19))}</td><td class="title-cell">${esc(c.note||'Checkpoint')}<span class="sub">${m.scenarios??'?'} scenario(s) · ${m.positions??'?'} positions · ${m.people??'?'} people · rev ${m.revision??'?'}</span></td><td style="white-space:nowrap"><button class="btn compact-btn" data-checkpoint-restore="${esc(c.id)}">Restore</button> <button class="btn compact-btn" data-checkpoint-copy="${esc(c.id)}">Restore as copy</button> <button class="btn compact-btn" data-checkpoint-del="${esc(c.id)}" aria-label="Delete checkpoint">×</button></td></tr>`;
  }).join(''):'<tr><td colspan="3" class="empty-row">No checkpoints yet. They are created before restores, imports and sample loads.</td></tr>';
  renderHistory();
}
function openHistory(){renderRecovery().catch(error=>toast(error.message));openDialog('historyModal');}
async function restoreCheckpoint(id,asCopy=false){
  const row=await OrgFlowStore.readCheckpoint(id);
  if(!row?.planning){toast('That checkpoint is no longer available.');renderRecovery();return;}
  const label=asCopy?'Restore this checkpoint as a separate workspace copy':'Restore this checkpoint';
  if(!confirm(`${label}? The current workspace is checkpointed first and stays recoverable.`))return;
  try{
    await checkpointWorkspace('Before restoring a checkpoint');
    let planning=row.planning;
    if(asCopy){planning=structuredClone(planning);planning.workspaceId=makeId('ws');planning.recoveredFrom={workspaceId:row.planning.workspaceId||'',revision:row.planning.revision||0,checkpointId:id};}
    if(row.branding){branding=cleanBranding(row.branding);try{appStorage.setItem(BRANDING_KEY,JSON.stringify(branding));}catch{}applyBranding();}
    if(row.theme)setTheme(row.theme,false);if(row.palette)setPalette(row.palette,false);if(row.view)restoreView(row.view);
    commitPlanning(planning,asCopy?'Checkpoint restored as a copy':'Checkpoint restored');
    closeDialog('historyModal');
  }catch(error){toast(error.message);}
}
async function restorePendingSave(){
  const pending=await OrgFlowStore.getPending();
  if(!pending?.planning){toast('Nothing pending to restore.');renderRecovery();return;}
  if(!confirm('Restore the changes that never reached the shared workspace? The current workspace is checkpointed first.'))return;
  try{
    await checkpointWorkspace('Before restoring unsynchronized changes');
    commitPlanning(validatePlanning(pending.planning),'Recovered unsynchronized changes');
    await OrgFlowStore.flush();
    closeDialog('historyModal');
  }catch(error){toast(error.message);}
}
async function restoreHistoryIndex(index){
  let list=[];try{list=JSON.parse(appStorage.getItem(HISTORY_KEY)||'[]');}catch{list=[];}
  const item=list[index];if(!item?.planning)return;
  if(!confirm('Restore this earlier version? Current work stays in Undo for this session and is checkpointed first.'))return;
  try{await checkpointWorkspace('Before restoring an earlier version');commitPlanning(item.planning,'Restored earlier version',{historyNote:'Before restoring a local version'});closeDialog('historyModal');}catch(error){toast(error.message);}
}
async function normalizePersonPhoto(file){
  const logo=await normalizeLogoFile(file);
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('The photo could not be decoded.'));img.src=logo.data;});
  const size=128,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser cannot process this photo.');
  const k=Math.max(size/image.naturalWidth,size/image.naturalHeight),dw=image.naturalWidth*k,dh=image.naturalHeight*k;
  ctx.drawImage(image,(size-dw)/2,(size-dh)/2,dw,dh);
  const data=canvas.toDataURL('image/png');
  if(data.length>160000)throw new Error('Photo is still too large after shrinking. Use a simpler image.');
  return validPersonPhoto({data,width:size,height:size});
}

$('#brandingBtn').onclick=openBranding;$('#brandingClose').onclick=$('#brandingCancel').onclick=closeBranding;$('#brandingSave').onclick=saveBranding;
for(const slot of ['primary','dark']){
  const suffix=slot==='primary'?'Primary':'Dark',input=$(`#${slot}LogoInput`),key=slot==='primary'?'logo':'darkLogo';
  $(`#upload${suffix}`).onclick=()=>{input.value='';input.click()};input.onchange=()=>input.files[0]&&uploadLogo(input.files[0],slot);
  $(`#remove${suffix}`).onclick=()=>{if(!brandingDraft)return;brandingDraft[key]=null;brandingError('');renderBrandingPreview()};
  $(`#${slot}Surface`).onchange=e=>{if(brandingDraft?.[key])brandingDraft[key].surface=e.target.value;renderBrandingPreview()};
  const zone=$(`[data-logo-slot="${slot}"]`);zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragover')});zone.addEventListener('dragleave',()=>zone.classList.remove('dragover'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragover');if(e.dataTransfer.files.length!==1){brandingError('Drop one logo image at a time.');return}uploadLogo(e.dataTransfer.files[0],slot)});
}
$('#brandingModal').addEventListener('keydown',e=>{
  if(e.key!=='Tab')return;const focusables=$$('#brandingModal button:not([disabled]),#brandingModal input:not([hidden]):not([disabled]),#brandingModal select:not([disabled])').filter(x=>x.getClientRects().length);
  const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
});
$('#backupBtn').onclick=async()=>{if(await allowEnterpriseExport('workspace'))exportWorkspace();};$('#restoreBtn').onclick=()=>restoreWorkspacePicker();$('#restoreInput').onchange=e=>restoreWorkspace(e.target.files[0]);


svg.addEventListener('pointerdown',e=>{const node=e.target.closest?.('.node');if(node)beginCardDrag(e,node);});
wrap.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'||e.button!==0||e.target.closest?.('.node')||e.target.closest?.('[data-action="collapse"]')||e.target.closest?.('[data-select]'))return;
  const sx=e.clientX,sy=e.clientY,sl=wrap.scrollLeft,st=wrap.scrollTop;let moved=false;
  const move=ev=>{const dx=ev.clientX-sx,dy=ev.clientY-sy;if(!moved&&Math.hypot(dx,dy)<5)return;moved=true;wrap.classList.add('panning');wrap.scrollLeft=sl-dx;wrap.scrollTop=st-dy;ev.preventDefault();};
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);wrap.classList.remove('panning');};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
});
svg.addEventListener('pointerover',e=>{const node=e.target.closest?.('.node');const id=node?.dataset.id||null;if(id===pathHoverId)return;pathHoverId=id;applyPathClasses();});
svg.addEventListener('pointerleave',()=>{pathHoverId=null;applyPathClasses();});
svg.addEventListener('click',e=>{
  if(skipNodeClick){skipNodeClick=false;return;}
  const node=e.target.closest?.('.node');if(!node)return;const id=node.dataset.id;
  if(e.target.closest?.('[data-action="collapse"]')){
    const full=buildFilteredForest(),shown=flatten(applyDepthAndCollapse(full),[]).find(n=>n.id===id);const expanding=!shown?.children.length;
    if(shown?.children.length)collapsed.add(id);else{if(maxDepth!==99){for(const n of flatten(full,[]))if(n.depth===maxDepth-1&&n.children.length)collapsed.add(n.id);maxDepth=99;$$('#depthSeg button').forEach(b=>b.classList.toggle('active',b.dataset.depth==='99'))}collapsed.delete(id)}
    render();if(expanding)centerChart();return;
  }
  if(e.metaKey||e.ctrlKey||e.shiftKey){toggleSelected(id,true);return;}
  openDrawer(id);
});
$('#themeBtn').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
$('#paletteBtn').onclick=e=>{e.stopPropagation();$('#exportMenu').classList.remove('open');$('#paletteMenu').classList.toggle('open')};
$('#paletteMenu').onclick=e=>{const b=e.target.closest('button[data-palette]');if(!b)return;setPalette(b.dataset.palette);closeMenus();toast(`${b.querySelector('b')?.textContent||'Palette'} palette applied`)};
$('#drawerClose').onclick=requestCloseDrawer;$('#drawerCancel').onclick=requestCloseDrawer;$('#saveBtn').onclick=saveDrawer;$('#deleteBtn').onclick=deleteSelected;$('#addBtn').onclick=()=>openDrawer('',true);
$('#search').addEventListener('input',()=>{const q=$('#search').value.trim().toLowerCase();if(q){const hits=people.filter(p=>baseVisible(p)&&matchesSearch(p,q));if(hits.length){maxDepth=99;$$('#depthSeg button').forEach(b=>b.classList.toggle('active',b.dataset.depth==='99'));for(const hit of hits){let id=hit.managerId;const guard=new Set();while(id&&!guard.has(id)){guard.add(id);collapsed.delete(id);id=people.find(x=>x.id===id)?.managerId||''}}}}render()});
$('#asOf').onchange=render;$('#dateFilter').onchange=render;$('#depthSeg').onclick=e=>{const b=e.target.closest('button[data-depth]');if(!b)return;maxDepth=+b.dataset.depth;$$('#depthSeg button').forEach(x=>x.classList.toggle('active',x===b));render()};
$('#expandBtn').onclick=()=>{collapsed.clear();maxDepth=99;$$('#depthSeg button').forEach(x=>x.classList.toggle('active',x.dataset.depth==='99'));render();centerChart();};
$('#collapseBtn').onclick=()=>{collapsed=new Set(people.filter(p=>p.type==='Team Leader').map(p=>p.id));maxDepth=2;$$('#depthSeg button').forEach(x=>x.classList.toggle('active',x.dataset.depth==='2'));render()};$('#centerBtn').onclick=fitChart;
$('#csvBtn').onclick=async()=>{if(await allowEnterpriseExport('csv'))exportCSV()};$('#templateBtn').onclick=downloadTemplate;$('#importBtn').onclick=()=>{if(enterpriseBlocksWrite()){toast('You can view this organization but you cannot import.');return;}triggerImport();};$('#sideImportBtn').onclick=()=>$('#importBtn').click();$('#fileInput').onchange=e=>e.target.files[0]&&importFile(e.target.files[0]);
$('#exportBtn').onclick=e=>{e.stopPropagation();$('#paletteMenu').classList.remove('open');$('#exportMenu').classList.toggle('open')};$('#exportMenu').onclick=async e=>{
  const b=e.target.closest('button[data-export]');if(!b)return;closeMenus();const kind=b.dataset.export;
  if(kind==='restore'){restoreWorkspacePicker();return;}
  const audit=kind==='save'||kind==='saveAs'?'workspace':kind==='print'?'a3':kind;
  if(!(await allowEnterpriseExport(audit)))return;
  if(kind==='png')exportCurrentPNG();
  else if(kind==='groups')exportGroups();
  else if(kind==='pdf')exportBoardPack();
  else if(kind==='a3')exportA3Pages();
  else if(kind==='print')printChartView();
  else if(kind==='html')exportShareableHTML();
  else if(kind==='interactive')openShareDialog();
  else if(kind==='people')exportPeopleCSV();
  else if(kind==='workspace')exportWorkspace();
  else if(kind==='bundle')exportOrgflowBundle();
  else if(kind==='save')saveWorkspaceToDisk(false);
  else if(kind==='saveAs')saveWorkspaceToDisk(true);
  else exportCSV();
};document.addEventListener('click',e=>{if(!e.target.closest('.menu-wrap'))closeMenus()});
$('#importClose').onclick=$('#importCancel').onclick=()=>closeDialog('importModal');$('#importModal').addEventListener('click',e=>{if(e.target===$('#importModal'))closeDialog('importModal')});$('#importConfirm').onclick=confirmImport;$('#importMapGrid').addEventListener('change',e=>{if(e.target.closest('select[data-map-col]'))reimportWithMapping();});
window.addEventListener('keydown',e=>{
  const tag=(e.target.tagName||'').toLowerCase();
  const typing=tag==='textarea'||tag==='select'||(tag==='input'&&e.target.type!=='checkbox');
  if(dialogStack.length&&e.key!=='Escape')return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){if(tag==='textarea'||(tag==='input'&&e.target.id!=='search'))return;e.preventDefault();$('#search').focus();return;}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!typing){e.preventDefault();if(e.shiftKey)redoChange();else undoChange();return;}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='o'&&!typing){e.preventDefault();restoreWorkspacePicker();return;}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!typing)saveWorkspaceToDisk(e.shiftKey);return;}
  if(e.key==='Escape'){
    const top=dialogStack.at(-1);if(top){if(top.id==='welcomeModal')markWelcomeSeen();closeDialog(top.id);e.preventDefault();return;}
    const modalOpen=id=>$('#'+id)?.classList.contains('open');
    if(modalOpen('brandingModal')){closeBranding();return;}
    if(modalOpen('welcomeModal')){closeWelcome();return;}
    if(modalOpen('historyModal')){closeDialog('historyModal');return;}
    if(modalOpen('importModal')){closeDialog('importModal');return;}
    if(modalOpen('scenarioModal')||modalOpen('directoryModal')||modalOpen('personModal'))return;
    if($('.layout')?.classList.contains('filters-open')){setFiltersOpen(false);return;}
    if($('#drawer').classList.contains('open')){requestCloseDrawer();return;}
    if(selectedIds.size){clearSelection();return;}
    closeMenus();
  }
});window.addEventListener('resize',render);
function paintPlanner(){
  loadSavedPlanningView();setupTheme();setupChips();setupPlanningEvents();updateUndoButtons();syncAutosaveUi();
}
async function startLocalPlanner(){
  configureWorkspaceScope(null);await initPlanning();paintPlanner();
  render();setTimeout(centerChart,0);maybeShowWelcome();resumeFileHandle();refreshRecentFiles().catch(error=>toast(error.message));
  try{navigator.storage?.persist?.();}catch{}
}
async function applyEnterpriseWorkspace(doc){
  const next=validatePlanning(doc.planning);
  // Put the server document in memory first. IndexedDB pending lookup must
  // not leave `workspace` null — Firefox can take long enough that an edit
  // after `enabled` would crash on `next.scenarios`.
  workspace=next;lastSavedPlanningText=JSON.stringify(next);modelLoadError='';$('#loadError').classList.add('hidden');
  try{appStorage.setItem(PLANNING_KEY,lastSavedPlanningText);}catch{}
  branding=cleanBranding(doc.branding);try{appStorage.setItem(BRANDING_KEY,JSON.stringify(branding));}catch{}
  writeDurable(next,lastSavedPlanningText);
  undoStack=[];redoStack=[];syncProjection();hidePositionEditor();
  setPalette(doc.palette||'indigo',false);setTheme(doc.theme==='dark'?'dark':'light',false);
  applyBranding();paintPlanner();
  if(doc.view)restoreView(doc.view);
  render();setTimeout(centerChart,0);
  try{navigator.storage?.persist?.();}catch{}
  // The server document must not silently overwrite edits that never synced.
  // A pending record stays recoverable in the recovery center either way.
  try{
    const pending=await OrgFlowStore.getPending();
    if(pending?.planning&&JSON.stringify(pending.planning)!==JSON.stringify(next)){
      toast('Local changes that never reached the server were kept — see Recovery & backups.');
    }
  }catch{}
}
function acceptEnterpriseSnapshot(doc,{preserveView=true}={}){
  const oldId=workspace?.activeScenarioId,view=preserveView?captureView():doc.view;
  const next=validatePlanning(doc.planning);
  if(preserveView&&next.scenarios.some(s=>s.id===oldId&&!s.archived))next.activeScenarioId=oldId;
  const serialized=JSON.stringify(next);try{appStorage.setItem(PLANNING_KEY,serialized);}catch{toast('Server saved, but the browser cache is unavailable. Export a backup or clear storage before editing again.');}lastSavedPlanningText=serialized;workspace=next;
  branding=cleanBranding(doc.branding);safePreference(BRANDING_KEY,JSON.stringify(branding));setPalette(doc.palette,false);setTheme(doc.theme,false);
  writeDurable(next,serialized);
  syncProjection();if(view)restoreView(view);applyBranding();setupChips();render();scheduleFileAutosave();
}
window.applyEnterpriseWorkspace=applyEnterpriseWorkspace;
window.enterpriseWorkspacePayload=()=>workspacePayload();
$('#undoBtn').onclick=undoChange;$('#redoBtn').onclick=redoChange;$('#helpBtn').onclick=()=>openWelcome(true);
$('#historyBtn').onclick=openHistory;$('#historyClose').onclick=()=>closeDialog('historyModal');
$('#autoSaveFile').onchange=e=>{try{appStorage.setItem(AUTOSAVE_KEY,e.target.checked?'1':'0');}catch{}filePersistence.setEnabled(e.target.checked);syncAutosaveUi();};
$('#retrySave').onclick=()=>saveWorkspaceToDisk();$('#unlinkFile').onclick=unlinkWorkspaceFile;
window.addEventListener('beforeunload',e=>{if(durableWrites||durableError||drawerIsDirty()||filePersistence.dirty||window.OrgFlowEnterprise?.hasPending?.()){e.preventDefault();e.returnValue='';}});
$('#historyRows').onclick=e=>{const b=e.target.closest('[data-history]');if(b)restoreHistoryIndex(Number(b.dataset.history));};
$('#checkpointRows').onclick=e=>{
  const restore=e.target.closest('[data-checkpoint-restore]');if(restore){restoreCheckpoint(restore.dataset.checkpointRestore,false);return;}
  const copy=e.target.closest('[data-checkpoint-copy]');if(copy){restoreCheckpoint(copy.dataset.checkpointCopy,true);return;}
  const del=e.target.closest('[data-checkpoint-del]');if(del){OrgFlowStore.deleteCheckpoint(del.dataset.checkpointDel).then(renderRecovery).catch(error=>toast(error.message));}
};
$('#recoveryLegacy')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-legacy-restore]');if(!b)return;
  restoreLegacyProfile(Number(b.dataset.legacyRestore));
});
async function restoreLegacyProfile(index){
  const row=window.orgflowDesktop?.loadLegacyProfile?.(index);
  if(!row?.planning){toast('That recovered copy is no longer available.');return;}
  if(!confirm('Restore this copy from an older desktop profile as a separate workspace? The current workspace is checkpointed first.'))return;
  try{
    await checkpointWorkspace('Before restoring an older desktop profile');
    const planning=structuredClone(row.planning);
    planning.workspaceId=makeId('ws');
    planning.recoveredFrom={workspaceId:row.planning.workspaceId||'',revision:row.planning.revision||0,source:'legacy-desktop'};
    commitPlanning(planning,'Restored from older desktop profile');
    if(row.branding){branding=cleanBranding(row.branding);applyBranding();}
    closeDialog('historyModal');toast('Restored as a copy from an older desktop profile');
  }catch(error){toast(error.message);}
}
$('#recoveryPending').onclick=e=>{
  if(e.target.closest('[data-pending-restore]')){restorePendingSave();return;}
  if(e.target.closest('[data-pending-discard]')&&confirm('Discard the recoverable changes? The shared workspace stays as the server has it.')){OrgFlowStore.clearPending().then(renderRecovery);}
};
$('#reconnectFile').onclick=reconnectSavedFile;
$('#welcomeClose').onclick=$('#welcomeSkip').onclick=closeWelcome;
$('#welcomeHarbor').onclick=()=>{const skip=welcomeFirstRun;closeWelcome();loadSampleWorkspace('harbor-and-co',{skipConfirm:skip});};
$('#templateGrid').onclick=e=>{const b=e.target.closest('.template-card');if(!b)return;const skip=welcomeFirstRun;closeWelcome();if(b.dataset.kind==='example')loadSampleWorkspace(b.dataset.id,{skipConfirm:skip});else loadStarterTemplate(b.dataset.id,{skipConfirm:skip});};
$('#uploadPhotoBtn').onclick=()=>{$('#photoInput').value='';$('#photoInput').click();};
$('#photoInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;const session=drawerSession;photoBusy=true;$('#saveBtn').disabled=true;try{const photo=await normalizePersonPhoto(file);if(session!==drawerSession)return;photoDraft=photo;updatePhotoNote();toast('Photo attached');}catch(error){if(session===drawerSession)toast(error.message||'Could not use this photo.');}finally{if(session===drawerSession){photoBusy=false;$('#saveBtn').disabled=false;}}};
$('#removePhotoBtn').onclick=()=>{drawerSession++;photoBusy=false;$('#saveBtn').disabled=false;photoDraft=null;updatePhotoNote();};
$('#exampleHarborBtn').onclick=()=>loadSampleWorkspace('harbor-and-co');
$('#exampleNorthstarBtn').onclick=()=>loadSampleWorkspace('northstar-commerce');
$('#exampleEmptyBtn').onclick=()=>loadSampleWorkspace('',{empty:true});
$('#exampleFirstLightBtn').onclick=()=>loadStarterTemplate('first-light');
$('#exampleLumenBtn').onclick=()=>loadStarterTemplate('lumen-studio');
$('#exampleCedarBtn').onclick=()=>loadStarterTemplate('cedar-kind');

$('#zoomOut').onclick=()=>setZoom(zoom-.1);$('#zoomIn').onclick=()=>setZoom(zoom+.1);
$$('input[name="importMode"]').forEach(input=>input.onchange=renderImportReview);



$('#importAsProposal').onchange=renderImportReview;
$('#loadImportProfile').onclick=()=>{
  const profile=(workspace.importProfiles||[]).find(p=>p.name===$('#importProfileSelect').value);if(!profile||!pendingImport?.headers)return;
  pendingImportOverrides=Object.fromEntries(pendingImport.headers.map((h,i)=>[i,profile.columns[h]&&(profile.columns[h]==='id'||profile.ownedFields.includes(profile.columns[h]))?profile.columns[h]:'ignore']));
  const mode=$(`input[name="importMode"][value="${profile.mode}"]`);if(mode)mode.checked=true;
  pendingImport=prepareImport(pendingImportText,pendingImportName);renderImportReview();toast('Mapping loaded. Check ignored or renamed source columns before importing.');
};
$('#saveImportProfile').onclick=()=>{
  if(!pendingImport?.headers?.length)return;
  try{
    if(new Set(pendingImport.headers).size!==pendingImport.headers.length)throw new Error('Rename duplicate source headers before saving a reusable mapping.');
    const name=prompt('Name this source mapping (ignored fields remain owned by OrgFlow):');if(!name?.trim())return;
    const columns=Object.fromEntries(pendingImport.headers.map((h,i)=>[h,$(`[data-map-col="${i}"]`).value]));
    const profile={name:name.trim(),columns,ownedFields:[...new Set(Object.values(columns).filter(v=>v!=='ignore'))],mode:$('input[name="importMode"]:checked').value};
    if((workspace.importProfiles||[]).some(p=>p.name.toLowerCase()===profile.name.toLowerCase())&&!confirm('Replace the existing mapping named '+profile.name+'?'))return;
    const next=structuredClone(workspace);next.importProfiles=(next.importProfiles||[]).filter(p=>p.name.toLowerCase()!==profile.name.toLowerCase());if(next.importProfiles.length>=20)throw new Error('At most 20 source mappings are supported.');next.importProfiles.push(profile);
    commitPlanning(next,'Source mapping saved');updateImportProfiles();$('#importProfileSelect').value=profile.name;
  }catch(error){toast(error.message);}
};

$('#recentFiles').onchange=e=>{if(e.target.value!=='')restoreWorkspacePicker(Number(e.target.value));e.target.value='';};
async function refreshUpdateUi(){
  if(!window.orgflowDesktop?.updateState)return;
  $('#updatesSection').hidden=false;
  const state=await window.orgflowDesktop.updateState();
  $('#updateStatus').textContent=`OrgFlow ${state.version} · ${state.message}`;
  const button=$('#updateAppBtn');
  button.textContent=state.phase==='ready'?'Save and restart to update':state.phase==='available'?'Download update':'Check for updates';
  button.disabled=['unsupported','checking','downloading'].includes(state.phase);
}
$('#releaseNotesBtn').onclick=()=>window.orgflowDesktop?.openReleases();
$('#updateAppBtn').onclick=async()=>{
  let updatePoll=null;
  $('#updateAppBtn').disabled=true;
  try{
    const state=await window.orgflowDesktop.updateState();
    if(state.phase==='ready'){
      if(documentOperationBusy||workspaceIOBusy||drawerIsDirty())throw new Error('Finish editing or opening the chart before restarting.');
      workspaceIOBusy=true;
      try{
        await OrgFlowStore.flush();
        await window.OrgFlowEnterprise?.flush?.();
        if(fileHandleNeedsReconnect)throw new Error('Reconnect the saved file or unlink it before restarting.');
        if(filePersistence.dirty)await filePersistence.save();
        await filePersistence.idle();
        if(filePersistence.dirty||filePersistence.error)throw new Error('Save the linked file before restarting.');
        const result=window.orgflowDesktop.saveWorkspace(JSON.stringify(workspacePayload()));
        if(result?.error||!result?.wrote)throw new Error(result?.error||'Could not save the desktop recovery copy.');
        await checkpointWorkspace('Before application update');
        await window.orgflowDesktop.installUpdate();
      }finally{workspaceIOBusy=false;}
    }else{
      updatePoll=setInterval(()=>refreshUpdateUi().catch(()=>{}),500);
      await window.orgflowDesktop.runUpdate();
    }
  }catch(error){toast(error.message||'Update failed.');}
  finally{clearInterval(updatePoll);await refreshUpdateUi();}
};
refreshUpdateUi().catch(error=>toast(error.message));
