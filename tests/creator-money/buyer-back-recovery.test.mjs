import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const filename = "app/channel-subscription/[creatorId].tsx";
const source = readFileSync(filename, "utf8");
const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === "TouchableOpacity") {
    const attrs = node.attributes.properties;
    const hasTestId = attrs.some(attr => ts.isJsxAttribute(attr)
      && attr.name.getText(tree) === "testID" && attr.initializer
      && ts.isStringLiteral(attr.initializer) && attr.initializer.text === "platform-subscription-back-button");
    if (hasTestId) {
      const press = attrs.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(tree) === "onPress");
      assert.ok(press?.initializer && ts.isJsxExpression(press.initializer) && press.initializer.expression);
      handler = press.initializer.expression.getText(tree);
    }
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(handler, "execute the production subscription Back handler, not a test implementation");

function execute({ history, creatorId, body = handler }) {
  const calls = [];
  const router = {
    canGoBack: () => history,
    back: () => calls.push({ action: "back" }),
    replace: route => calls.push({ action: "replace", route }),
  };
  new Function("router", "creatorId", `return (${body});`)(router, creatorId)();
  return calls;
}

test("production subscription Back uses history before creator or home fallbacks", () => {
  for (const creatorId of ["creator-one", ""]) {
    assert.deepEqual(execute({ history: true, creatorId }), [{ action: "back" }]);
  }
});

test("production subscription Back recovers cold links to the exact creator or home", () => {
  for (const creatorId of ["creator-one", "creator-two"]) {
    assert.deepEqual(execute({ history: false, creatorId }), [{
      action: "replace", route: { pathname: "/channel/[userId]", params: { userId: creatorId } },
    }]);
  }
  assert.deepEqual(execute({ history: false, creatorId: "" }), [{ action: "replace", route: "/(tabs)" }]);
});

test("negative controls detect lost cold-link recovery and incorrect creator destinations", () => {
  assert.notDeepEqual(execute({ history: false, creatorId: "", body: "() => router.back()" }), [{ action: "replace", route: "/(tabs)" }]);
  const wrongCreator = handler.replace("userId: creatorId", 'userId: "other-creator"');
  assert.notEqual(wrongCreator, handler);
  assert.notDeepEqual(execute({ history: false, creatorId: "creator-one", body: wrongCreator }), [{
    action: "replace", route: { pathname: "/channel/[userId]", params: { userId: "creator-one" } },
  }]);
});
