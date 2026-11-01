import assert from 'node:assert/strict';
import ts from 'typescript';

const parse = source => ts.createSourceFile('intent.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const find = (root, predicate) => {
  const found = [];
  const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root); return found;
};
const one = (nodes, label) => { assert.equal(nodes.length, 1, label); return nodes[0]; };
const identifier = (node, name) => !!node && ts.isIdentifier(node) && node.text === name;
const call = (node, name) => ts.isCallExpression(node) && identifier(node.expression, name);

export function assertRestorationIntentForwarding(source) {
  const tree = parse(source);
  const fn = one(find(tree, n => ts.isFunctionDeclaration(n) && identifier(n.name, 'restoreScheduledAccountDeletion')), 'one restoration wrapper');
  const dispatch = one(find(fn.body, n => call(n, 'runAccountRestorationBoundSupabaseMutationRpc')), 'restoration wrapper must use the dedicated dispatcher');
  assert.ok(ts.isAwaitExpression(dispatch.parent), 'await the dedicated restoration dispatcher');
  assert.equal(dispatch.arguments.length, 2, 'forward both initiating authority and current-intent guard');
  assert.ok(identifier(fn.parameters[0]?.name, 'expected') && identifier(fn.parameters[1]?.name, 'isCurrent'), 'explicit initiating intent parameters');
  assert.ok(identifier(dispatch.arguments[0], 'expected'), 'forward initiating authority unchanged');
  assert.ok(identifier(dispatch.arguments[1], 'isCurrent'), 'forward initiating current guard unchanged');
}

export function assertSettingsRemovalIntentPublication(source) {
  const tree = parse(source);
  const declaration = one(find(tree, n => ts.isVariableDeclaration(n) && identifier(n.name, 'onRemoveProfileMedia')), 'one Settings removal handler');
  const wrapper = declaration.initializer;
  assert.ok(call(wrapper, 'useCallback'), 'removal handler remains a callback');
  const handler = wrapper.arguments[0];
  assert.ok(ts.isArrowFunction(handler) && ts.isBlock(handler.body), 'block-bodied removal handler');
  const owner = one(handler.body.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations].filter(n => identifier(n.name, 'removalAuthority')) : []), 'capture owner when opening confirmation');
  assert.ok(call(owner.initializer, 'getCurrentAccountSessionAuthoritySnapshot'), 'capture published initiating authority before retained Alert');
  const removal = one(find(handler.body, n => call(n, 'removeProfileMedia')), 'one removal dispatch inside handler');
  assert.equal(removal.arguments.length, 2, 'removal requires initiating owner and lifecycle guard');
  assert.ok(identifier(removal.arguments[0], 'kind'), 'preserve chosen media kind');
  const options = removal.arguments[1];
  assert.ok(ts.isObjectLiteralExpression(options), 'explicit initiating removal owner');
  const authority = one(options.properties.filter(n => ts.isPropertyAssignment(n) && identifier(n.name, 'authority')), 'one owner authority');
  assert.ok(identifier(authority.initializer, 'removalAuthority'), 'do not recapture replacement authority at confirmation');
  assert.ok(options.properties.some(n => ts.isShorthandPropertyAssignment(n) && identifier(n.name, 'isCurrent')), 'pass the retained lifecycle guard');
  assert.ok(ts.isAwaitExpression(removal.parent), 'await removal acknowledgement');
  const result = removal.parent.parent;
  assert.ok(ts.isVariableDeclaration(result) && identifier(result.name, 'nextProfile'), 'retain acknowledged profile result');
  const statement = result.parent.parent;
  assert.ok(ts.isVariableStatement(statement) && ts.isBlock(statement.parent), 'dispatch belongs to publication block');
  const statements = [...statement.parent.statements];
  const position = statements.indexOf(statement);
  const guard = statements[position + 1];
  assert.ok(guard && ts.isIfStatement(guard) && ts.isPrefixUnaryExpression(guard.expression)
    && guard.expression.operator === ts.SyntaxKind.ExclamationToken && call(guard.expression.operand, 'isCurrent')
    && ts.isReturnStatement(guard.thenStatement), 'recheck current intent after await and before UI publication');
  const publication = statements[position + 2];
  assert.ok(publication && ts.isExpressionStatement(publication) && call(publication.expression, 'setMyProfile')
    && identifier(publication.expression.arguments[0], 'nextProfile'), 'publish only acknowledged current profile');
}
