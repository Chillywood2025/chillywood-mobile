import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Execute the actual client normalizers/readers. Only their RPC transport and
// platform are substituted; neither access results nor parsing are mocked.
export function reservedRoomClient(path, payload) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  const require=name=>{
    if(name==='./supabase')return {supabase:{rpc:async()=>({data:payload,error:null})}};
    if(name==='./entitlementAuthority')return {withAuthorityReadDeadline:async operation=>await operation};
    if(name==='react-native')return {Platform:{OS:'ios'}};
    return {};
  };
  new Function('require','module','exports',code)(require,module,module.exports);
  return module.exports;
}

// Select complete production declarations, retaining their actual control flow.
// External transports can be supplied, but authorization helpers are not mocked.
export function reservedRoomDeclarations(path, names, dependencies={}) {
  const raw=readFileSync(path,'utf8');
  const ast=ts.createSourceFile(path,raw,ts.ScriptTarget.Latest,true);
  const selected=names.map(name=>{
    const nodes=ast.statements.filter(node=>
      (ts.isFunctionDeclaration(node)&&node.name?.text===name)
      || (ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)===name)));
    if(nodes.length!==1)throw new Error(`Expected one production declaration ${name}`);
    return nodes[0].getText(ast).replace(/^export\s+/, '');
  });
  const code=ts.transpileModule(selected.join('\n')+`\nreturn {${names.join(',')}};`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  return new Function(...Object.keys(dependencies),code)(...Object.values(dependencies));
}
