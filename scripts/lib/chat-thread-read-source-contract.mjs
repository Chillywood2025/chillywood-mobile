import assert from 'node:assert/strict';
import ts from 'typescript';

// Check the actual callback scopes and statement ordering, not character
// distances from the public wrapper. Mounted tests exercise the same closures.
export function assertChatThreadReadSourceContract(source) {
  const ast = ts.createSourceFile('thread.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const compact = node => node.getText(ast).replace(/\s+/gu, '');
  const one = (values, message) => { assert.equal(values.length, 1, message); return values[0]; };
  const callback = name => {
    const declarations = [];
    const visit = node => {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declarations.push(node);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    const initializer = one(declarations, `one ${name} callback`).initializer;
    assert.ok(ts.isCallExpression(initializer) && compact(initializer.expression) === 'useCallback', `${name} is a production callback`);
    const fn = initializer.arguments[0];
    assert.ok(ts.isArrowFunction(fn) && ts.isBlock(fn.body), `${name} has a scoped implementation`);
    return fn;
  };
  const variable = (statements, name) => one(statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations].filter(declaration => compact(declaration.name) === name) : []), `one scoped ${name}`);
  const rejects = (statement, condition, message) => {
    assert.ok(statement && ts.isIfStatement(statement), message);
    assert.equal(compact(statement.expression), condition, message);
    assert.ok(ts.isReturnStatement(statement.thenStatement) && !statement.thenStatement.expression && !statement.elseStatement, message);
  };
  const worker = callback('readThreadState');
  assert.ok(worker.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword), 'read worker awaits its boundaries');
  const statements = [...worker.body.statements];
  assert.equal(compact(variable(statements, 'ownsSession').initializer),
    '()=>sameAccountSessionAuthority(authority,getCurrentAccountSessionAuthoritySnapshot())', 'read worker checks live exact session authority');
  const read = variable(statements, 'read');
  assert.equal(compact(read.initializer), 'beginThreadRead()', 'worker captures its read generation');
  const readIndex = statements.findIndex(statement => ts.isVariableStatement(statement) && [...statement.declarationList.declarations].includes(read));
  rejects(statements[readIndex - 1], '!isRefreshCurrent()||!ownsSession()', 'refresh and live session reject before dispatch');
  rejects(statements[readIndex + 1], '!read', 'missing generation rejects before dispatch');
  assert.equal(compact(variable(statements, 'isCurrent').initializer),
    '()=>isRefreshCurrent()&&ownsSession()&&isThreadReadCurrent(read)', 'currentness combines refresh, live session, and captured read generation');

  const attempt = one(statements.filter(ts.isTryStatement), 'one guarded read attempt');
  const reads = [...attempt.tryBlock.statements];
  const cut = variable(reads, 'activityCut');
  assert.equal(compact(cut.initializer), 'awaitreadChatActivityCut(threadId)', 'worker obtains an observed activity cut');
  const cutIndex = reads.findIndex(statement => ts.isVariableStatement(statement) && [...statement.declarationList.declarations].includes(cut));
  rejects(reads[cutIndex + 1], '!isCurrent()', 'obsolete activity cut cannot dispatch the collection reads');
  const projection = variable(reads, 'nextThread');
  assert.equal(compact(projection.initializer), 'awaitreconcileEndedCallState(loadedThread,isCurrent)', 'call reconciliation receives the same currentness guard');
  const projectionIndex = reads.findIndex(statement => ts.isVariableStatement(statement) && [...statement.declarationList.declarations].includes(projection));
  rejects(reads[projectionIndex - 1], '!isCurrent()', 'obsolete collection read cannot begin call reconciliation');
  rejects(reads[projectionIndex + 1], '!isCurrent()', 'obsolete reconciliation cannot project call state');

  const wrapper = callback('loadThreadState');
  const wrapperStatements = [...wrapper.body.statements];
  assert.equal(compact(variable(wrapperStatements, 'promise').initializer), 'readThreadState(isRefreshCurrent)',
    'public wrapper forwards its refresh predicate to the guarded worker');
  const returned = wrapperStatements.at(-1);
  assert.ok(ts.isReturnStatement(returned) && compact(returned.expression) === 'promise',
    'public wrapper returns the exact guarded worker promise');
  const explicitBranch = one(wrapperStatements.filter(ts.isIfStatement), 'one explicit read ownership branch');
  assert.equal(compact(explicitBranch.expression), '!isRefreshCurrent', 'only explicit reads own the projection barrier');
  assert.equal(compact(variable([...explicitBranch.thenStatement.statements], 'explicit').initializer),
    '{owner:messageEntryKey,promise}', 'explicit barrier retains the exact entry and worker promise');
  assert.equal(compact(explicitBranch.thenStatement.statements[1]), 'explicitThreadReadRef.current=explicit;',
    'explicit worker promise is installed as the owned projection barrier');
}
