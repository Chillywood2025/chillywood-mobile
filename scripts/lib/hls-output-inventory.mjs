import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';

const fail=code=>{throw new Error(`hls_inventory_${code}`);};
const safeRelative=value=>typeof value==='string'&&value.length>0&&value.length<=1024
  && /^[A-Za-z0-9_.\/-]+$/.test(value)&&!value.startsWith('/')
  && value.split('/').every(part=>part!==''&&part!=='.'&&part!=='..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

// Local generated-byte evidence only. This does not prove uploaded bytes,
// immutable provider generation, ownership, writer drain or deletion authority.
export function buildHlsOutputInventory({outputRoot,outputPrefix,files,roots}) {
  if(typeof outputPrefix!=='string'||!outputPrefix.endsWith('/')
    ||!safeRelative(outputPrefix.slice(0,-1)))fail('prefix_invalid');
  if(!Array.isArray(files)||files.length===0||files.length>32768
    ||files.some(file=>!safeRelative(file))||new Set(files).size!==files.length)fail('files_invalid');
  if(!Array.isArray(roots)||roots.length===0||roots.length>32
    ||roots.some(root=>!safeRelative(root)||!root.endsWith('.m3u8'))
    ||new Set(roots).size!==roots.length)fail('roots_invalid');
  const root=realpathSync(outputRoot),objects=new Map(),fileSet=new Set(files);let totalBytes=0;
  for(const relativePath of [...files].sort()) {
    const local=path.join(root,...relativePath.split('/'));
    const stat=lstatSync(local),real=realpathSync(local);
    // Reject symlinks, including directory symlinks inside the root. The
    // inventory must describe the exact local upload paths, not aliases.
    if(!stat.isFile()||real!==local||!real.startsWith(root+path.sep))fail('file_binding_invalid');
    const playlist=relativePath.endsWith('.m3u8');
    if(stat.size<=0||stat.size>(playlist?4*1024*1024:128*1024*1024))fail('file_size_invalid');
    totalBytes+=stat.size;if(totalBytes>64*1024*1024*1024)fail('total_size_exceeded');
    const bytes=readFileSync(local);
    if(bytes.length!==stat.size)fail('file_changed');
    const dependencies=[];
    if(playlist) {
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      const lines=text.replace(/\r\n/g,'\n').split('\n');
      if(lines[0]!=='#EXTM3U')fail('header_invalid');
      for(const raw of lines.slice(1)) {
        const line=raw.trim();if(!line)continue;
        let references=[];
        if(!line.startsWith('#'))references=[line];
        else {
          if(line.startsWith('#EXT-X-KEY:')&&line!=='#EXT-X-KEY:METHOD=NONE')fail('encryption_unsupported');
          if(/\bURI\s*=/.test(line)) {
            if(!/^#EXT-X-(MAP|MEDIA|I-FRAME-STREAM-INF):/.test(line))fail('uri_tag_unsupported');
            const match=line.match(/(?:[:,])URI="([^"]+)"(?:,|$)/);
            if(!match||(line.match(/\bURI\s*=/g)||[]).length!==1)fail('uri_invalid');
            references=[match[1]];
          }
        }
        for(const reference of references) {
          if(!safeRelative(reference))fail('reference_invalid');
          const resolved=path.posix.join(path.posix.dirname(relativePath),reference);
          if(!fileSet.has(resolved))fail('dependency_missing');
          dependencies.push(resolved);
        }
      }
      if(dependencies.length===0)fail('playlist_empty');
    }
    objects.set(relativePath,{relativePath,objectKey:outputPrefix+relativePath,
      kind:playlist?'playlist':'media',sizeBytes:bytes.length,sha256:hash(bytes),
      dependencies:[...new Set(dependencies)].sort()});
  }
  const visited=new Set(),active=new Set();
  function visit(key,depth) {
    if(depth>16)fail('depth_exceeded');
    if(active.has(key))fail('cycle');if(visited.has(key))return;
    const object=objects.get(key);if(!object)fail('root_missing');
    active.add(key);for(const child of object.dependencies)visit(child,depth+1);
    active.delete(key);visited.add(key);
  }
  for(const entry of roots)visit(entry,0);
  if(visited.size!==objects.size)fail('unreachable_object');
  const inventory=[...objects.values()];
  return {schemaVersion:1,evidenceKind:'local_generated_hls_bytes',retentionQualified:false,
    providerBytesVerified:false,objectCount:inventory.length,totalBytes,
    inventorySha256:hash(JSON.stringify(inventory)),objects:inventory};
}
