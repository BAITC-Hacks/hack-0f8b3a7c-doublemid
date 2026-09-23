import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
const secret=parseEnv(fs.readFileSync('.env.local','utf8')).OPENAI_API_KEY;
if (!secret||secret.length<20) throw Error('Local key is missing; its value is not printed.');
let inspected=0;
const candidates=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())candidates.push(p);}}
walk('dist');
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of [...new Set([...candidates,...tracked])]){inspected++;if(fs.readFileSync(file).includes(secret))throw Error('Secret found in an artifact or tracked file; do not publish.');}
console.log('PASS: local API key is absent from '+inspected+' build artifacts and non-ignored source files.');
