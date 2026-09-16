'use strict';
/** Dependency-free syntax, script wiring and whitespace checks; ESLint is a separate gate. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let count=0;
function visit(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory()){visit(file);continue;}if(!/\.(?:js|cjs)$/.test(file))continue;const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(checked.status!==0)throw new Error(checked.stderr);count++;}}
for(const dir of ['js','server','desktop','scripts','tests'])visit(path.join(root,dir));
for(const name of ['index.html','app.html','admin.html','login.html']){const html=fs.readFileSync(path.join(root,name),'utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(new Set(ids).size!==ids.length)throw new Error('Duplicate DOM ID in '+name);for(const [,src]of html.matchAll(/<script[^>]+src="([^"]+)"/g)){if(!src.startsWith('http')&&!fs.existsSync(path.join(root,src)))throw new Error('Missing script '+src);}if(/\son(?:click|change|input|load)="/.test(html))throw new Error('Inline event handler violates CSP in '+name);}
console.log(`Syntax checked ${count} scripts; HTML IDs and script references are valid.`);
