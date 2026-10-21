import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Production client source roots, not tests, Edge functions, or build tooling.
const clientRoots = ['_lib', 'app', 'components', 'constants', 'hooks', 'modules'];
const wrappers = new Set([
  '_lib/creatorMonetization.ts:safeCount',
  '_lib/dmca.ts:readCompleteDmcaHistory',
  '_lib/moneyAuditEvents.ts:readSourceRows',
  '_lib/platformFinance.ts:readTableCount',
  '_lib/platformFinance.ts:readTableCountWhereEq',
  '_lib/platformUsage.ts:readTableCount',
  '_lib/platformUsage.ts:readTableCountWhereEq',
  '_lib/platformUsage.ts:readTableCountForProvider',
]);
const operations = new Set(['select', 'insert', 'update', 'upsert', 'delete']);

export function readClientSources(root) {
  const sources = new Map();
  const visit = relative => {
    for (const entry of fs.readdirSync(path.join(root, relative), {withFileTypes: true})) {
      const file = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.[cm]?[jt]sx?$/u.test(file) && !file.endsWith('.d.ts')) sources.set(file, fs.readFileSync(path.join(root, file), 'utf8'));
    }
  };
  for (const directory of clientRoots) visit(directory);
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    if (entry.isFile() && /\.[cm]?[jt]sx?$/u.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      sources.set(entry.name, fs.readFileSync(path.join(root, entry.name), 'utf8'));
    }
  }
  return sources;
}

// Use lexical symbols, not global text matches: imported aliases and shadowed
// constants must resolve to their actual declarations. This is deliberately a
// finite static evaluator. New dynamic boundaries fail closed for review.
export function discoverClientGrantConsumers(sources) {
  const files = new Map([...sources].map(([name, text]) => [name,
    ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true)]));
  const host = {
    getSourceFile: name => files.get(name), getDefaultLibFileName: () => '',
    writeFile: () => {}, getCurrentDirectory: () => '', getDirectories: () => [],
    fileExists: name => files.has(name), readFile: name => sources.get(name),
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    resolveModuleNames: (names, importer) => names.map(name => {
      const base = name.startsWith('@/') ? name.slice(2)
        : name.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(importer), name)) : null;
      if (!base) return undefined;
      const target = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].flatMap(extension => [`${base}${extension}`, `${base}/index${extension}`])].find(candidate => files.has(candidate));
      return target ? {resolvedFileName: target} : undefined;
    }),
  };
  const program = ts.createProgram([...files.keys()], {noLib: true, allowJs: true, target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve}, host);
  const checker = program.getTypeChecker();
  const symbol = node => {
    const found = checker.getSymbolAtLocation(node);
    return found?.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(found) : found;
  };
  const fail = (node, detail) => {
    const source = node.getSourceFile();
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    throw new Error(`${source.fileName}:${line}: unclassified client Data API boundary: ${detail}. Review the consumer and explicit-api-client-operations.json; do not add blanket grants.`);
  };
  const walk = (node, callback) => { callback(node); ts.forEachChild(node, child => walk(child, callback)); };
  const unwrap = node => {
    while (node && (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
      || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
    return node;
  };
  const checkedBindings = new Map();
  function checkBinding(declaration, collection = false) {
    if (checkedBindings.has(declaration) && (!collection || checkedBindings.get(declaration))) return;
    checkedBindings.set(declaration, collection);
    const name = declaration.name;
    if (!ts.isIdentifier(name)) fail(name, 'unsupported table binding');
    const binding = symbol(name);
    for (const source of files.values()) walk(source, node => {
      if (!ts.isIdentifier(node) || node.text !== name.text || node === name || symbol(node) !== binding) return;
      let target = node;
      while ((ts.isPropertyAccessExpression(target.parent) || ts.isElementAccessExpression(target.parent))
        && target.parent.expression === target) target = target.parent;
      const parent = target.parent;
      if (ts.isBinaryExpression(parent) && parent.left === target
        && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        || ts.isPostfixUnaryExpression(parent) || ts.isPrefixUnaryExpression(parent) || ts.isDeleteExpression(parent)) {
        fail(node, 'table binding or finite source is mutated');
      }
      if (collection) {
        const access = node.parent;
        const mapRead = ts.isPropertyAccessExpression(access) && access.expression === node && access.name.text === 'map'
          && ts.isCallExpression(access.parent) && access.parent.expression === access;
        const propertyRead = ts.isPropertyAccessExpression(access) && access.expression === node
          && !(ts.isCallExpression(access.parent) && access.parent.expression === access);
        if (!mapRead && !propertyRead) fail(node, 'finite table source is mutated or escapes reviewed reads');
      }
    });
  }
  function values(input, visiting = new Set()) {
    const node = unwrap(input);
    if (!node || visiting.has(node)) fail(input, 'unresolved or recursive table expression');
    const next = new Set([...visiting, node]);
    if (ts.isStringLiteralLike(node)) return [node.text];
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(element => values(element, next));
    if (ts.isObjectLiteralExpression(node)) {
      const result = {};
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) fail(property, 'unsupported finite table object');
        const resolved = values(property.initializer, next);
        if (resolved.length !== 1) fail(property, 'ambiguous table object property');
        result[property.name.text] = resolved[0];
      }
      return [result];
    }
    if (ts.isPropertyAccessExpression(node)) {
      const resolved = values(node.expression, next).map(value => value?.[node.name.text]);
      if (resolved.some(value => value === undefined)) fail(node, 'unresolved table property');
      return resolved;
    }
    if (ts.isIdentifier(node)) {
      const declaration = symbol(node)?.valueDeclaration;
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
        && ts.isVariableDeclarationList(declaration.parent) && declaration.parent.flags & ts.NodeFlags.Const) {
        const initializer = unwrap(declaration.initializer);
        if (ts.isArrayLiteralExpression(initializer) || ts.isObjectLiteralExpression(initializer)) checkBinding(declaration, true);
        return values(declaration.initializer, next);
      }
      if (declaration && ts.isParameter(declaration)) {
        checkBinding(declaration);
        const fn = declaration.parent;
        const call = fn.parent;
        // The reviewed wrappers use finite .map arrays, including object.table.
        if (ts.isArrowFunction(fn) && fn.parameters[0] === declaration && ts.isCallExpression(call)
          && call.arguments[0] === fn && ts.isPropertyAccessExpression(call.expression)
          && call.expression.name.text === 'map') {
          const resolved = values(call.expression.expression, next);
          if (resolved.some(value => typeof value === 'object')) checkBinding(declaration, true);
          return resolved;
        }
      }
    }
    fail(node, `cannot resolve ${node.getText()}`);
  }
  function wrapperTables(argument) {
    const declaration = symbol(argument)?.valueDeclaration;
    if (!declaration || !ts.isParameter(declaration)) return values(argument);
    checkBinding(declaration);
    const fn = declaration.parent;
    const name = ts.isFunctionDeclaration(fn) ? fn.name
      : ts.isArrowFunction(fn) && ts.isVariableDeclaration(fn.parent) ? fn.parent.name : null;
    const file = argument.getSourceFile().fileName;
    if (!name || !ts.isIdentifier(name) || fn.parameters[0] !== declaration || !wrappers.has(`${file}:${name.text}`)) {
      fail(argument, 'dynamic table parameter is not a reviewed finite wrapper');
    }
    const fnSymbol = symbol(name);
    const tables = [];
    // Require a closed local wrapper. Exporting, aliasing or passing it as a
    // callback is a new boundary, rather than silently ignoring its callers.
    const owner = ts.isFunctionDeclaration(fn) ? fn : fn.parent.parent.parent;
    if (owner.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) fail(name, 'table wrapper is exported');
    for (const source of files.values()) walk(source, node => {
      if (!ts.isIdentifier(node) || node.text !== name.text || node === name || symbol(node) !== fnSymbol) return;
      if (!ts.isCallExpression(node.parent) || node.parent.expression !== node) fail(node, 'table wrapper escapes direct calls');
      tables.push(...values(node.parent.arguments[0]));
    });
    if (!tables.length) fail(name, 'table wrapper has no finite call sites');
    return tables;
  }
  function literalMethod(input, seen = new Set()) {
    const node = unwrap(input);
    if (!node || seen.has(node)) return null;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const next = new Set([...seen, node]);
      const left = literalMethod(node.left, next), right = literalMethod(node.right, next);
      return left !== null && right !== null ? left + right : null;
    }
    if (!ts.isIdentifier(node)) return null;
    const declaration = symbol(node)?.valueDeclaration;
    return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
      && ts.isVariableDeclarationList(declaration.parent) && declaration.parent.flags & ts.NodeFlags.Const
      ? literalMethod(declaration.initializer, new Set([...seen, node])) : null;
  }
  const methodName = access => ts.isPropertyAccessExpression(access) ? access.name.text
    : ts.isElementAccessExpression(access) ? literalMethod(access.argumentExpression) : null;
  function chainMethods(call) {
    const methods = [];
    let cursor = call;
    while ((ts.isPropertyAccessExpression(cursor.parent) || ts.isElementAccessExpression(cursor.parent))
      && cursor.parent.expression === cursor && ts.isCallExpression(cursor.parent.parent)
      && cursor.parent.parent.expression === cursor.parent) {
      methods.push({name: methodName(cursor.parent), access: cursor.parent});
      cursor = cursor.parent.parent;
    }
    return methods;
  }
  function checkReceiver(input, seen = new Set()) {
    const node = unwrap(input);
    if (!node || seen.has(node)) return;
    const next = new Set([...seen, node]);
    if (ts.isIdentifier(node)) {
      const declaration = symbol(node)?.valueDeclaration;
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) checkReceiver(declaration.initializer, next);
    } else if (ts.isElementAccessExpression(node)) fail(node, 'computed Data API receiver requires classification');
    else if (ts.isPropertyAccessExpression(node)) checkReceiver(node.expression, next);
    else if (ts.isCallExpression(node)) {
      if (ts.isElementAccessExpression(node.expression)) fail(node, 'computed method producing a Data API receiver requires classification');
      if (ts.isPropertyAccessExpression(node.expression)) checkReceiver(node.expression.expression, next);
    }
  }
  const consumers = [];
  for (const source of files.values()) walk(source, node => {
    if (ts.isBindingElement(node)) {
      const property = node.propertyName ?? node.name;
      const name = ts.isIdentifier(property) ? property.text
        : ts.isComputedPropertyName(property) ? literalMethod(property.expression) : literalMethod(property);
      if (['from', 'schema'].includes(name)) fail(node, 'destructured from/schema method requires classification');
    }
    if (ts.isCallExpression(node) && methodName(node.expression) === 'schema'
      && (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]) || node.arguments[0].text !== 'public')) fail(node, 'non-public or dynamic schema');
    if (ts.isElementAccessExpression(node) && ['from', 'schema'].includes(methodName(node))) fail(node, 'computed from/schema access requires classification');
    if (ts.isCallExpression(node) && ts.isElementAccessExpression(node.expression)
      && chainMethods(node).some(({name}) => operations.has(name) || ['from', 'schema'].includes(name))) {
      fail(node, 'computed method feeding a Data API chain requires classification');
    }
    // Also inspect a terminal operation's receiver. Splitting a computed query
    // into a local variable must not turn an unknown API boundary into no calls.
    if (ts.isCallExpression(node) && operations.has(methodName(node.expression))) checkReceiver(node.expression.expression);
    if (ts.isPropertyAccessExpression(node) && ['from', 'schema'].includes(node.name.text)
      && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) fail(node, 'extracted from/schema method requires classification');
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
      || node.expression.name.text !== 'from') return;
    const receiver = node.expression.expression;
    if (ts.isIdentifier(receiver) && ['Array', 'Uint8Array', 'Buffer'].includes(receiver.text) && !symbol(receiver)?.valueDeclaration) return;
    checkReceiver(receiver);
    const chain = chainMethods(node);
    if (chain.some(({access}) => ts.isElementAccessExpression(access))) fail(node, 'computed operation in a Data API chain requires classification');
    const methods = chain.map(({name}) => name);
    const used = methods.filter(method => operations.has(method));
    if (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'storage' && !used.length) return;
    if (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'storage') fail(node, 'database operation on a storage-shaped receiver');
    if (!used.length || !node.arguments[0]) fail(node, 'from() has no classified operation');
    const tables = ts.isIdentifier(node.arguments[0]) ? wrapperTables(node.arguments[0]) : values(node.arguments[0]);
    const privileges = new Set(used.flatMap(operation => operation === 'upsert' ? ['INSERT', 'SELECT', 'UPDATE']
      : ['update', 'delete'].includes(operation) ? [operation.toUpperCase(), 'SELECT'] : [operation.toUpperCase()]));
    for (const table of new Set(tables)) {
      if (typeof table !== 'string' || !/^[a-z_][a-z_0-9]*$/u.test(table)) fail(node, 'table name is not a public relation identifier');
      consumers.push({table, privileges: [...privileges].sort(), file: source.fileName,
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1});
    }
  });
  return consumers;
}

export function assertClientGrantCoverage(consumers, inventory) {
  const reviewed = new Map(inventory.map(row => [row.table, row]));
  const missing = [];
  for (const {table, privileges, file, line} of consumers) {
    const entry = reviewed.get(table);
    const consumer = entry?.consumers.find(row => row.file === file);
    const absent = privileges.filter(privilege => !consumer?.privileges.includes(privilege));
    if (!consumer || absent.length) {
      missing.push(`${file}:${line}: ${table} ${absent.length ? absent.join(', ') : 'consumer file'} is not covered`);
    }
  }
  if (missing.length) throw new Error(`Unclassified client Data API consumers:\n${[...new Set(missing)].join('\n')}\nReview explicit-api-client-operations.json and fresh-schema ACLs; do not add blanket grants.`);
}
