// Canonical JSONB-array text without a second full aggregate JSONB tree.
// Arguments are reviewed SQL source expressions, never user-provided SQL.
export function canonicalArrayTextSQL(value, orderBy, filter = '') {
  return `('['||coalesce(string_agg(coalesce((${value})::text,'null'), ', ' order by ${orderBy})${filter},'')||']')`;
}
