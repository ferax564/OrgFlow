#!/usr/bin/env node
'use strict';
// Verify the actual distributable, not merely the presence of signing secrets.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const version=require('../package.json').version;
const dist=path.resolve(process.argv[2]||'dist');
function run(command,args){return execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
try{
  if(process.platform==='darwin'){
    const team=process.env.APPLE_TEAM_ID;
    if(!team)throw new Error('APPLE_TEAM_ID is required to verify the release identity.');
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orgflow-signature-'));
    try{
      run('ditto',['-x','-k',path.join(dist,`OrgFlow-${version}-mac.zip`),temp]);
      const app=path.join(temp,'OrgFlow.app');
      run('codesign',['--verify','--deep','--strict',app]);
      // codesign writes identity details to stderr even on success.
      const {spawnSync}=require('node:child_process');
      const result=spawnSync('codesign',['-d','--verbose=4',app],{encoding:'utf8'});
      const details=result.stderr||'';
      if(result.status!==0||!details.includes('Authority=Developer ID Application:')||!details.split('\n').includes('TeamIdentifier='+team))throw new Error('The ZIP is not signed by the expected Developer ID team.');
      run('xcrun',['stapler','validate',app]);
      run('spctl',['--assess','--type','execute','--verbose=2',app]);
    }finally{fs.rmSync(temp,{recursive:true,force:true});}
    console.log('PASS: shipped macOS ZIP has the expected Developer ID, a valid notarization ticket, and passes Gatekeeper.');
  }else if(process.platform==='win32'){
    if(!process.env.WIN_PUBLISHER_NAME)throw new Error('WIN_PUBLISHER_NAME is required to verify the release identity.');
    const files=['windows-setup.exe','windows.exe'].map(s=>path.join(dist,`OrgFlow-${version}-${s}`));
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`
      $ErrorActionPreference='Stop'
      foreach ($file in ($env:ORGFLOW_VERIFY_FILES | ConvertFrom-Json)) {
        $signature=Get-AuthenticodeSignature -LiteralPath $file
        if ($signature.Status -ne 'Valid') { throw 'Release signature is invalid or untrusted.' }
        if (-not $signature.TimeStamperCertificate) { throw 'Release signature has no trusted timestamp.' }
        if ($signature.SignerCertificate.GetNameInfo('SimpleName',$false) -cne $env:WIN_PUBLISHER_NAME) { throw 'Release publisher does not match WIN_PUBLISHER_NAME.' }
      }
    `],{env:{...process.env,ORGFLOW_VERIFY_FILES:JSON.stringify(files)},stdio:'inherit'});
    console.log('PASS: shipped Windows installer and portable EXE have valid timestamped signatures from the expected publisher.');
  }else throw new Error('Run signing verification on a macOS or Windows build host.');
}catch(error){console.error('Release verification failed:',error.message);if(error.stderr)console.error(String(error.stderr));process.exitCode=1;}
