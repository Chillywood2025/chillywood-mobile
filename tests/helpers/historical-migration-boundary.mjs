// Historical fixtures must not run future wrappers against an incomplete old
// schema. Discover the full suffix, exclude it before seeding, and replay it in
// order afterwards. Missing boundaries fail rather than silently changing era.
import {readdirSync} from 'node:fs';
const directory=new URL('../../supabase/migrations/',import.meta.url);
export function migrationsFrom(boundary,{inclusive=true}={}) {
 const names=readdirSync(directory).filter(name=>/^\d+_.+\.sql$/.test(name)).sort();
 if(!names.includes(boundary))throw Error(`Historical migration boundary is missing: ${boundary}`);
 return names.filter(name=>inclusive?name>=boundary:name>boundary);
}
