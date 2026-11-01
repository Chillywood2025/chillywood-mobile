import ts from 'typescript';

// Scope by syntax, not the useCallback dependency array: adding a legitimate
// guard dependency must not make the retained post-purchase path disappear.
export function inspectPaidPartyRouteContract(source) {
  const file=ts.createSourceFile('watch-party/index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const declarations=[];
  const visit=node=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='onBuyPaidTicketAndJoin')declarations.push(node);ts.forEachChild(node,visit);};
  visit(file);
  const errors=[];
  const initializer=declarations.length===1?declarations[0].initializer:null;
  const callback=initializer&&ts.isCallExpression(initializer)&&ts.isIdentifier(initializer.expression)&&initializer.expression.text==='useCallback'?initializer.arguments[0]:null;
  if(!callback||!ts.isArrowFunction(callback)||!ts.isBlock(callback.body))return ['Paid Watch-Party Seat Pass buyer post-purchase callback scope could not be found unambiguously'];
  let navigationCalls=0,verifiedCalls=0;
  const check=(node,verifiedBlock=null)=>{
    if(ts.isFunctionLike(node))return; // An uncalled nested function is not a handoff.
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='navigateToPreviewRoom'){
      navigationCalls++;
      const awaited=node.parent,statement=awaited?.parent;
      if(verifiedBlock&&ts.isAwaitExpression(awaited)&&ts.isExpressionStatement(statement)&&statement.parent===verifiedBlock
        &&node.arguments.length===1&&ts.isIdentifier(node.arguments[0])&&node.arguments[0].text==='targetPreview')verifiedCalls++;
    }
    if(ts.isIdentifier(node)&&node.text==='setEmbeddedLiveStageEntry')errors.push('Paid Watch-Party Seat Pass buyer path must not embed Live Stage');
    if((ts.isStringLiteralLike(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node))&&node.text.includes('/watch-party/live-stage'))errors.push('Paid Watch-Party Seat Pass buyer path must not route directly to Live Stage');
    if(ts.isIfStatement(node)&&node.expression.getText(file).replace(/\s/g,'')==='result.ok&&result.access.allowed'){
      check(node.expression,verifiedBlock);check(node.thenStatement,node.thenStatement);if(node.elseStatement)check(node.elseStatement,verifiedBlock);return;
    }
    ts.forEachChild(node,child=>check(child,verifiedBlock));
  };
  check(callback.body);
  if(navigationCalls!==1||verifiedCalls!==1)errors.push('Paid Watch-Party Seat Pass buyer post-purchase path must call navigateToPreviewRoom(targetPreview) exactly once after verified purchase access');
  return errors;
}
