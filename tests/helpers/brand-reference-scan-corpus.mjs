// Synthetic matcher inputs shared by embedded and native PostgreSQL tests.
// SQL literals preserve JSON escape spellings before PostgreSQL parses jsonb.
const row = value => JSON.stringify(value);
export const referenceScanFixtureSQL = `
create table public.brand_reference_matcher_fixture(
 id integer, metadata jsonb, payload json, media_url text,
 "Odd URL \"\"雪\"\"" text, "percent%path" text, "percent%2Fpath" text, unrelated text
);
create table public.brand_reference_empty_fixture(id integer, unrelated text);
`;
const standard = 'public.brand_reference_matcher_fixture';
const empty = 'public.brand_reference_empty_fixture';
export const referenceScanCases = [];
const add = (label, document, key = 'brand/logo.png', path = 'storage/brand/logo.png', expected, table = standard) =>
 referenceScanCases.push({label, document, key, path, expected, table});
add('nested value', row({metadata:{levels:[null,{value:'https://invalid.example/brand/logo.png?x=1'}]}}), undefined, undefined, true);
add('nested key', row({metadata:{'brand/logo.png':{unrelated:true}}}), undefined, undefined, true);
add('path only', row({payload:['storage/brand/logo.png']}), 'not-the-key', undefined, true);
add('nonlocator excluded', row({unrelated:'brand/logo.png',metadata:{value:'other'}}), undefined, undefined, false);
add('unknown row field excluded', row({future_field:'brand/logo.png',metadata:null}), undefined, undefined, false);
add('empty key and null value nested', row({metadata:{'':null,key:'',list:[null,'',{},[]]}}), undefined, undefined, false);
add('null locator value', row({metadata:null,media_url:null}), 'null', 'absent', true);
add('empty document', '{}', undefined, undefined, false);
add('SQL NULL document', null, undefined, undefined, false);
add('empty key matches projected empty object', row({unrelated:'anything'}), '', null, true);
add('empty path matches projected empty object', '{}', null, '', true);
add('both needles NULL', row({metadata:'brand/logo.png'}), null, null, null);
add('key NULL path absent', '{}', null, 'absent', null);
add('key absent path NULL', '{}', 'absent', null, null);
add('key NULL path match', row({metadata:'storage/brand/logo.png'}), null, undefined, true);
add('key match path NULL', row({metadata:'brand/logo.png'}), undefined, null, true);
add('empty locator columns', row({unrelated:'brand/logo.png'}), undefined, undefined, false, empty);
add('empty locator columns empty key', row({unrelated:'brand/logo.png'}), '', null, true, empty);
add('empty locator columns punctuation', row({unrelated:'brand/logo.png'}), '{}', null, true, empty);
add('unknown table OID', row({metadata:'brand/logo.png'}), undefined, undefined, false, null);
add('unknown table OID empty key', row({metadata:'brand/logo.png'}), '', null, true, null);
add('weird quoted column', row({'Odd URL "雪"':'brand/logo.png',unrelated:'anything'}), undefined, undefined, true);
add('percent column name', row({'percent%path':'brand/logo.png'}), undefined, undefined, true);
add('encoded percent column name participates', row({'percent%2Fpath':'other'}), 'percent/path', 'absent', true);
add('encoded percent column name serialization', row({'percent%2Fpath':'other'}), '"percent/path": "other"', 'absent', true);
add('percent-free Unicode quotes and backslashes', row({metadata:'雪/é/😀 "quoted" \\path'}), '雪/é/😀 \\"quoted\\" \\\\path', 'absent', true);
add('percent document both needles NULL', row({metadata:{'brand%2Flogo.png':['%25','x%2Fy']}}), null, null, null);
add('encoded path with key NULL', row({metadata:'storage%2Fbrand%2Flogo.png'}), null, undefined, true);
add('escaped slashes', '{"metadata":"brand\\/logo.png"}', undefined, undefined, true);
add('escaped ASCII unicode', '{"metadata":"brand\\u002flogo.png"}', undefined, undefined, true);
add('raw unicode', row({metadata:'雪/é/😀.png'}), '雪/é/😀.png', 'absent', true);
add('escaped unicode surrogate pair', '{"metadata":"\\u96ea/\\u00e9/\\ud83d\\ude00.png"}', '雪/é/😀.png', 'absent', true);
add('unicode normalization unchanged', row({metadata:'雪/e\u0301/😀.png'}), '雪/é/😀.png', 'absent', false);
add('JSON newline serialized', row({metadata:'line\nend'}), 'line\\nend', 'absent', true);
add('JSON newline is not raw newline', row({metadata:'line\nend'}), 'line\nend', 'absent', false);
add('JSON quotes and backslash', row({metadata:'a"b\\c'}), 'a\\"b\\\\c', 'absent', true);
add('serialized punctuation spans fields', row({metadata:{a:'x',b:'y'}}), '"x", "b": "y"', 'absent', true);
add('serialized punctuation spans key and value', row({metadata:{a:'x',b:'y'}}), '"metadata": {"a": "x"', 'absent', true);
add('needle remains encoded', row({metadata:'brand%2Flogo.png'}), 'brand%2Flogo.png', 'absent', false);
add('lowercase encoding', row({metadata:'brand%2flogo.png'}), undefined, undefined, true);
add('mixed encodings', row({metadata:'%62rand%2Flogo%2epng'}), undefined, undefined, true);
add('mixed nested tokens same pass', row({metadata:'brand%25%32%46logo.png'}), undefined, undefined, true);
add('malformed percent tokens', row({metadata:'brand%2Glogo.png % %2 %% %xz'}), undefined, undefined, false);
add('nonprintable escapes stay encoded', row({metadata:'%00%1f%7F%80%ff'}), '%00%1f%7F%80%ff', 'absent', true);
add('percent encoded Unicode stays encoded', row({metadata:'%E9%9B%AA'}), '雪', 'absent', false);
add('decoded punctuation participates in serialized match', row({metadata:'x%22%3A%20%22y'}), 'x": "y', 'absent', true);
for(let depth = 1, slash = '%2F'; depth <= 5; depth++, slash = slash.replaceAll('%','%25')) {
 add(`percent depth ${depth}`, row({metadata:`brand${slash}logo.png`}), undefined, undefined, depth <= 4);
 add(`percent depth ${depth} key`, row({metadata:{[`brand${slash}logo.png`]:null}}), undefined, undefined, depth <= 4);
}
for(let code = 0; code < 256; code++) {
 const token = `%${code.toString(16).padStart(2,'0')}`;
 add(`byte ${code} nested`, row({metadata:{value:`prefix/${token}/suffix`,nested:[token]}}), `prefix/${code === 0 ? token : String.fromCharCode(code)}/suffix`, 'absent');
}

export const referenceScanErrors = [
 {label:'JSON null',document:'null'}, {label:'JSON array',document:'[]'},
 {label:'JSON string',document:'"brand/logo.png"'}, {label:'JSON number',document:'42'},
 {label:'JSON boolean',document:'true'},
].flatMap(input => [
 {context:'locator columns',table:standard},
 {context:'empty locator columns',table:empty},
 {context:'unknown table OID',table:null},
].map(({context,table}) => ({...input,label:`${input.label}: ${context}`,table})));
export const sqlLiteral = value => value === null ? 'null' : `'${String(value).replaceAll("'","''")}'`;
export function referenceScanEquivalenceSQL() {
 const tuples = referenceScanCases.map(c => `(${sqlLiteral(c.label)},${sqlLiteral(c.document)}::jsonb,${c.table ? `${sqlLiteral(c.table)}::regclass::oid` : '0::oid'},${sqlLiteral(c.key)},${sqlLiteral(c.path)},${c.expected === undefined ? 'false' : 'true'},${c.expected === undefined || c.expected === null ? 'null' : c.expected}::boolean)`);
 return `with cases(label,document,table_oid,key,path,has_expected,expected) as (values ${tuples.join(',\n')}),
 results as (select *,
   private.deleted_media_mentions(private.deleted_media_locator_document(document,table_oid),key)
    or private.deleted_media_mentions(private.deleted_media_locator_document(document,table_oid),path) as original,
   private.platform_brand_retention_row_mentions(document,private.deleted_media_locator_columns(table_oid),key,path) as optimized
 from cases)
 select label,original,optimized,expected,has_expected,
 original is not distinct from optimized as equivalent,
 not has_expected or optimized is not distinct from expected as expected_matches
 from results order by label`;
}
