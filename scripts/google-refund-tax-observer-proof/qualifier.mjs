// RETIRED combined query: immutable audit fixture, never executable default.
import fs from 'node:fs';
export const sql=fs.readFileSync(new URL('./evidence/retired-combined-a8b75bd4.sql',import.meta.url),'utf8');
