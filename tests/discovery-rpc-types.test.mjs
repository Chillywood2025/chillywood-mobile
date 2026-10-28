import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

test('discovery RPC typings exist in public schema, never graphql_public', () => {
  const source=ts.createSourceFile('database.types.ts',fs.readFileSync('supabase/database.types.ts','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const database=source.statements.find(node=>ts.isTypeAliasDeclaration(node)&&node.name.text==='Database');
  assert.ok(database&&ts.isTypeLiteralNode(database.type));
  const property=(type,name)=>type.members.find(node=>ts.isPropertySignature(node)&&node.name.getText(source)===name)?.type;
  const functions=schema=>{
    const schemaType=property(database.type,schema);assert.ok(schemaType&&ts.isTypeLiteralNode(schemaType));
    const result=property(schemaType,'Functions');assert.ok(result&&ts.isTypeLiteralNode(result));return result;
  };
  const publicFunctions=functions('public'),graphqlFunctions=functions('graphql_public');
  for(const name of ['can_receive_discovery_invalidation','authorize_discovery_invalidation_worker','flush_discovery_invalidations','read_discovery_invalidation_health']){
    assert.ok(property(publicFunctions,name),`${name} belongs to public.Functions`);
    assert.equal(property(graphqlFunctions,name),undefined,`${name} must not be exposed as a GraphQL schema function`);
  }
});
