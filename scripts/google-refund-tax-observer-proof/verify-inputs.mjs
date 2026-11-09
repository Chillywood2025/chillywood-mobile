import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const lock=JSON.parse(fs.readFileSync(new URL('./source-lock.json',import.meta.url),'utf8'));
export function assertPinned(name,bytes){
 if(!Object.hasOwn(lock.files,name)||createHash('sha256').update(bytes).digest('hex')!==lock.files[name])throw Error(`PROOF_SOURCE_DRIFT:${name}`);
}
export function verifyInputs(){
 for(const name of Object.keys(lock.files))assertPinned(name,fs.readFileSync(new URL(name,root)));
 return lock;
}
