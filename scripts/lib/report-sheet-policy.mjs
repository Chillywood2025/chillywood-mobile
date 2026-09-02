import { parse } from "@babel/parser";
import { createHash } from "node:crypto";
const REPORT_SHEET_RELEASE_SHA256 = "fc5e294bcaed9079f5710299ba90596ebef9665ece67fb800a3e3ee706e13df6";
const isNode = (value) => Boolean(value && typeof value === "object" && typeof value.type === "string");
const walk = (node, visit, bindings = new Map()) => {
  if (!isNode(node)) return;
  visit(node);
  if (node.type === "LogicalExpression" && node.operator === "&&" && ["JSXElement", "JSXFragment"].includes(unwrap(node.right)?.type)) {
    if (staticTruth(node.left, bindings) !== false) walk(node.right, visit, bindings);
    return;
  }
  if (node.type === "ConditionalExpression" && node.test?.type === "BooleanLiteral")
    return walk(node.test.value ? node.consequent : node.alternate, visit, bindings);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "comments"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((entry) => walk(entry, visit, bindings));
    else walk(value, visit, bindings);
  }
};
const unwrap = (node) => {
  let current = node;
  while (["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression", "ParenthesizedExpression"].includes(current?.type)) {
    current = current.expression;
  }
  return current;
};
const staticTruth = (node, bindings, seen = new Set()) => {
  const value = unwrap(node);
  if (value?.type === "BooleanLiteral") return value.value;
  if (value?.type === "NullLiteral") return false;
  if (["NumericLiteral", "StringLiteral"].includes(value?.type)) return Boolean(value.value);
  if (callMatches(value, "Boolean") && value.arguments.length === 1)
    return staticTruth(value.arguments[0], bindings, seen);
  if (value?.type === "Identifier" && bindings.has(value.name) && !seen.has(value.name)) return staticTruth(bindings.get(value.name), bindings, new Set([...seen, value.name]));
  return null;
};
const isIdentifier = (node, name) => unwrap(node)?.type === "Identifier" && unwrap(node).name === name;
const memberMatches = (node, objectName, propertyName) => {
  const member = unwrap(node);
  if (!["MemberExpression", "OptionalMemberExpression"].includes(member?.type)) return false;
  const property = member.computed ? unwrap(member.property)?.value : unwrap(member.property)?.name;
  return isIdentifier(member.object, objectName) && property === propertyName;
};
const callMatches = (node, calleeName) => unwrap(node)?.type === "CallExpression" &&
  isIdentifier(unwrap(node).callee, calleeName);
const directVariable = (block, name) => {
  if (block?.type !== "BlockStatement") return null;
  for (const statement of block.body) {
    if (statement.type !== "VariableDeclaration") continue;
    const declaration = statement.declarations.find((entry) => isIdentifier(entry.id, name));
    if (declaration) return declaration;
  }
  return null;
};
const directCall = (block, calleeName) => {
  if (block?.type !== "BlockStatement") return null;
  for (const statement of block.body) {
    const expression = statement.type === "ExpressionStatement" ? unwrap(statement.expression) : null;
    const candidate = expression?.type === "UnaryExpression" &&
      expression.operator === "void" ? unwrap(expression.argument) : expression;
    if (callMatches(candidate, calleeName)) return candidate;
  }
  return null;
};
const statementCall = (statement, calleeName, expectedValue) => {
  const expression = statement?.type === "ExpressionStatement" ? unwrap(statement.expression) : null;
  const candidate = expression?.type === "UnaryExpression" && expression.operator === "void"
    ? unwrap(expression.argument) : expression;
  if (!callMatches(candidate, calleeName)) return false;
  if (expectedValue === undefined) return candidate.arguments.length === 0;
  const argument = unwrap(candidate.arguments[0]);
  return candidate.arguments.length === 1 && argument?.type === "StringLiteral" && argument.value === expectedValue;
};
const exactResetBlock = (block, includeClose) => {
  if (block?.type !== "BlockStatement" || block.body.length !== (includeClose ? 3 : 2)) return false;
  return (
    statementCall(block.body[0], "setCategoryKey", "harassment_bullying") &&
    statementCall(block.body[1], "setNote", "") &&
    (!includeClose || statementCall(block.body[2], "onClose"))
  );
};
const exactBusyCloseBlock = (block) => {
  if (block?.type !== "BlockStatement" || block.body.length !== 4) return false;
  const busyGuard = block.body[0];
  return (
    busyGuard.type === "IfStatement" &&
    isIdentifier(busyGuard.test, "busy") &&
    busyGuard.consequent?.type === "ReturnStatement" &&
    !busyGuard.consequent.argument &&
    !busyGuard.alternate &&
    statementCall(block.body[1], "setCategoryKey", "harassment_bullying") &&
    statementCall(block.body[2], "setNote", "") &&
    statementCall(block.body[3], "onClose")
  );
};
const collectBindings = (statements) => {
  const bindings = new Map();
  for (const statement of statements ?? []) {
    const declaration = statement.type === "ExportNamedDeclaration"
      ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const entry of declaration.declarations) {
      if (entry.id?.type === "Identifier" && entry.init)
        bindings.set(entry.id.name, entry.init);
    }
  }
  return bindings;
};
const staticString = (node, bindings, seen = new Set()) => {
  const value = unwrap(node);
  if (!value) return null;
  if (value.type === "StringLiteral") return value.value;
  if (value.type === "JSXText") return value.value;
  if (value.type === "TemplateLiteral") {
    let output = "";
    for (let index = 0; index < value.quasis.length; index += 1) {
      output +=
        value.quasis[index].value.cooked ?? value.quasis[index].value.raw;
      if (index < value.expressions.length) {
        const expressionValue = staticString(
          value.expressions[index],
          bindings,
          seen,
        );
        if (expressionValue === null) return null;
        output += expressionValue;
      }
    }
    return output;
  }
  if (value.type === "BinaryExpression" && value.operator === "+") {
    const left = staticString(value.left, bindings, seen);
    const right = staticString(value.right, bindings, seen);
    return left === null || right === null ? null : `${left}${right}`;
  }
  if (value.type === "CallExpression") {
    const callee = unwrap(value.callee);
    const property = callee?.computed
      ? unwrap(callee.property)?.value
      : unwrap(callee?.property)?.name;
    let items = unwrap(callee?.object);
    if (items?.type === "Identifier" && bindings.has(items.name))
      items = unwrap(bindings.get(items.name));
    const separator =
      value.arguments.length === 0
        ? ","
        : staticString(value.arguments[0], bindings, seen);
    if (
      (callee?.type === "MemberExpression" ||
        callee?.type === "OptionalMemberExpression") &&
      property === "join" &&
      items?.type === "ArrayExpression" &&
      separator !== null
    ) {
      const values = items.elements.map((entry) =>
        staticString(entry, bindings, seen),
      );
      if (values.every((entry) => entry !== null)) return values.join(separator);
    }
  }
  if (
    value.type === "Identifier" &&
    bindings.has(value.name) &&
    !seen.has(value.name)
  ) {
    const nextSeen = new Set(seen);
    nextSeen.add(value.name);
    return staticString(bindings.get(value.name), bindings, nextSeen);
  }
  return null;
};
const stringSkeleton = (node, bindings, seen = new Set()) => {
  const value = unwrap(node);
  if (!value) return "";
  const exact = staticString(value, bindings, seen);
  if (exact !== null) return exact;
  if (value.type === "StringLiteral") return value.value;
  if (value.type === "TemplateLiteral") {
    return value.quasis
      .map((quasi, index) => {
        const expression = index < value.expressions.length
          ? stringSkeleton(value.expressions[index], bindings, seen) : "";
        return `${quasi.value.cooked ?? quasi.value.raw} ${expression}`;
      })
      .join(" ");
  }
  if (value.type === "BinaryExpression" && value.operator === "+") {
    return `${stringSkeleton(value.left, bindings, seen)} ${stringSkeleton(value.right, bindings, seen)}`;
  }
  if (value.type === "ConditionalExpression") {
    const truth = staticTruth(value.test, bindings);
    if (truth !== null) return stringSkeleton(truth ? value.consequent : value.alternate, bindings, seen);
    return `${stringSkeleton(value.consequent, bindings, seen)} ${stringSkeleton(value.alternate, bindings, seen)}`;
  }
  if (value.type === "CallExpression") {
    const callee = unwrap(value.callee);
    const items = unwrap(callee?.object);
    if (["MemberExpression", "OptionalMemberExpression"].includes(callee?.type) && unwrap(callee.property)?.name === "join" && items?.type === "ArrayExpression")
      return items.elements.map((entry) => stringSkeleton(entry, bindings, seen)).join(" ");
  }
  if (value.type === "Identifier" && bindings.has(value.name) && !seen.has(value.name)) {
    const nextSeen = new Set(seen);
    nextSeen.add(value.name);
    return stringSkeleton(bindings.get(value.name), bindings, nextSeen);
  }
  return " ";
};
const unsafeRoutingCopy = (value) => /\bqueue\b|review\s+path\s*:/i.test(value);
const unsafePrivacyCopy = (value) => /reports? (?:are |may be )?(?:shared|visible) (?:with|to) the reported (?:person|user)|reported (?:person|user) (?:can|will|may) (?:see|receive)|reported users? (?:are|will be) notified|(?:show|share|reveal|disclose|send).{0,48}(?:identity|name).{0,48}(?:account|reported|person|user)|(?:identity|name).{0,48}(?:show|share|reveal|disclos|send).{0,48}(?:account|reported|person|user)|(?:account|reported|person|user).{0,48}(?:see|receive|view).{0,48}(?:identity|name)/i.test(value);
const renderedTextSkeleton = (element, bindings) => {
  const parts = [];
  walk(element, (node) => {
    if (node.type === "JSXText") parts.push(node.value);
    if (node.type === "JSXExpressionContainer")
      parts.push(stringSkeleton(node.expression, bindings));
  }, bindings);
  return parts.join(" ").replace(/\s+/g, " ").trim();
};
const jsxName = (element) => element?.openingElement?.name?.type === "JSXIdentifier"
  ? element.openingElement.name.name : null;
const jsxAttribute = (element, name) => {
  const attributes = element?.openingElement?.attributes ?? [];
  if (attributes.some((entry) => entry.type === "JSXSpreadAttribute")) return null;
  const matches = attributes.filter((attribute) => attribute.type === "JSXAttribute" &&
    attribute.name?.type === "JSXIdentifier" && attribute.name.name === name);
  return matches.length === 1 ? matches[0] : null;
};
const jsxAttributeExpression = (element, name) => {
  const attribute = jsxAttribute(element, name);
  return attribute?.value?.type === "JSXExpressionContainer"
    ? unwrap(attribute.value.expression) : null;
};
const jsxAttributeString = (element, name) => {
  const attribute = jsxAttribute(element, name);
  return attribute?.value?.type === "StringLiteral" ? attribute.value.value : null;
};
const exactBusyStyle = (element, styleName) => {
  const value = jsxAttributeExpression(element, "style");
  const busyStyle = unwrap(value?.elements?.[1]);
  return value?.type === "ArrayExpression" && value.elements.length === 2 &&
    memberMatches(value.elements[0], "styles", styleName) &&
    busyStyle?.type === "LogicalExpression" && busyStyle.operator === "&&" &&
    isIdentifier(busyStyle.left, "busy") &&
    memberMatches(busyStyle.right, "styles", "buttonDisabled");
};
const jsxElements = (node, name, bindings) => {
  const elements = [];
  walk(node, (candidate) => {
    if (candidate.type === "JSXElement" && jsxName(candidate) === name) elements.push(candidate);
  }, bindings);
  return elements;
};
const literalStrings = (node) => {
  const values = [];
  walk(node, (candidate) => {
    if (candidate.type === "StringLiteral") values.push(candidate.value);
    if (candidate.type === "JSXText" && candidate.value.trim()) values.push(candidate.value.trim());
  });
  return values;
};
const jsxRendersIdentifier = (element, name, bindings) => {
  let rendered = false;
  walk(element, (candidate) => {
    if (candidate.type === "JSXExpressionContainer" &&
      candidate.expression?.type === "Identifier" && candidate.expression.name === name)
      rendered = true;
  }, bindings);
  return rendered;
};
const objectProperty = (object, name) => {
  const value = unwrap(object);
  if (value?.type !== "ObjectExpression") return null;
  if (value.properties.some((property) => property.type === "SpreadElement"))
    return null;
  const matches = value.properties.filter((property) => {
    if (property.type !== "ObjectProperty") return false;
    const key = property.computed ? unwrap(property.key)?.value
      : (property.key?.name ?? property.key?.value);
    return key === name;
  });
  return matches.length === 1 ? matches[0] : null;
};
const objectPropertyValue = (object, name) =>
  unwrap(objectProperty(object, name)?.value);
const findReportSheet = (program) => {
  for (const statement of program.body) {
    if (statement.type === "ExportNamedDeclaration" &&
      statement.declaration?.type === "FunctionDeclaration" &&
      statement.declaration.id?.name === "ReportSheet") return statement.declaration;
  }
  return null;
};
const exactPlatformKeyboardBehavior = (node) => {
  const value = unwrap(node);
  if (value?.type !== "ConditionalExpression") return false;
  const test = unwrap(value.test);
  return test?.type === "BinaryExpression" &&
    test.operator === "===" &&
    memberMatches(test.left, "Platform", "OS") &&
    unwrap(test.right)?.type === "StringLiteral" &&
    unwrap(test.right).value === "ios" &&
    unwrap(value.consequent)?.type === "StringLiteral" &&
    unwrap(value.consequent).value === "padding" &&
    unwrap(value.alternate)?.type === "StringLiteral" && unwrap(value.alternate).value === "height";
};
const exactInset = (node, side, minimum) => {
  const value = unwrap(node);
  if (value?.type !== "CallExpression" || !memberMatches(value.callee, "Math", "max"))
    return false;
  return value.arguments.length === 2 &&
    memberMatches(value.arguments[0], "insets", side) &&
    unwrap(value.arguments[1])?.type === "NumericLiteral" &&
    unwrap(value.arguments[1]).value === minimum;
};
const validateStyleContract = (programBindings, findings) => {
  const stylesCall = unwrap(programBindings.get("styles"));
  if (
    stylesCall?.type !== "CallExpression" ||
    !memberMatches(stylesCall.callee, "StyleSheet", "create") ||
    stylesCall.arguments.length !== 1
  ) {
    findings.push("styles must be bound to StyleSheet.create");
    return;
  }
  const sheetStyle = objectPropertyValue(stylesCall.arguments[0], "sheet");
  const keyboardStyle = objectPropertyValue(stylesCall.arguments[0], "keyboardAvoider");
  const overlayStyle = objectPropertyValue(stylesCall.arguments[0], "overlay");
  if (keyboardStyle?.properties?.length !== 1 ||
    objectPropertyValue(keyboardStyle, "flex")?.value !== 1 ||
    overlayStyle?.properties?.length !== 3 || objectPropertyValue(overlayStyle, "flex")?.value !== 1 ||
    objectPropertyValue(overlayStyle, "justifyContent")?.value !== "flex-end")
    findings.push("report sheet ancestor styles must remain visible and full-screen");
  const maxHeight = objectPropertyValue(sheetStyle, "maxHeight");
  if (maxHeight?.type !== "StringLiteral" || maxHeight.value !== "92%")
    findings.push("sheet maxHeight must be exactly 92% in the rendered style contract");
  const scrollerStyle = objectPropertyValue(stylesCall.arguments[0], "sheetScroller");
  const flexGrow = objectPropertyValue(scrollerStyle, "flexGrow");
  if (scrollerStyle?.properties?.length !== 1 || flexGrow?.type !== "NumericLiteral" || flexGrow.value !== 0) {
    findings.push("sheet scroller must remain content-bounded");
  }
  const sheetContentStyle = objectPropertyValue(stylesCall.arguments[0], "sheetContent");
  const contentGap = objectPropertyValue(sheetContentStyle, "gap");
  if (sheetContentStyle?.properties?.length !== 1 ||
    contentGap?.type !== "NumericLiteral" || contentGap.value !== 12)
    findings.push("sheet content must not override safe-area-aware layout");
  if (sheetStyle?.properties?.length !== 8 || objectProperty(sheetStyle, "display") || objectProperty(sheetStyle, "opacity"))
    findings.push("sheet style must remain visibly rendered");
  const helperStyle = objectPropertyValue(stylesCall.arguments[0], "helperText"); if (helperStyle?.properties?.length !== 4 || objectPropertyValue(helperStyle, "color")?.value !== "#8F99B1" ||
    objectPropertyValue(helperStyle, "fontSize")?.value !== 12 || objectPropertyValue(helperStyle, "lineHeight")?.value !== 18)
    findings.push("report privacy guidance must remain visibly styled");
  for (const styleName of ["categoryChip", "formalNoticeButton", "primaryButton", "secondaryButton"]) {
    const style = objectPropertyValue(stylesCall.arguments[0], styleName);
    const expectedCount = { categoryChip: 9, formalNoticeButton: 8, primaryButton: 6, secondaryButton: 8 }[styleName];
    const minHeight = objectPropertyValue(style, "minHeight");
    const minWidth = objectPropertyValue(style, "minWidth");
    if (style?.properties?.length !== expectedCount || objectProperty(style, "width") || minHeight?.type !== "NumericLiteral" || minHeight.value < 48 ||
      minWidth?.type !== "NumericLiteral" || minWidth.value < 48)
      findings.push(`${styleName} must preserve a 48-point minimum touch target`);
  }
};
const validateVisibilityReset = (reportSheet, findings) => {
  const effects = [];
  for (const statement of reportSheet.body.body) {
    const expression =
      statement.type === "ExpressionStatement"
        ? unwrap(statement.expression)
        : null;
    if (callMatches(expression, "useEffect")) effects.push(expression);
  }
  const resetEffect = effects.find((effect) => {
    const callback = unwrap(effect.arguments[0]);
    if (
      callback?.type !== "ArrowFunctionExpression" ||
      callback.body?.type !== "BlockStatement" ||
      callback.body.body.length !== 1 ||
      effect.arguments.length !== 2
    )
      return false;
    const dependencies = unwrap(effect.arguments[1]);
    if (
      dependencies?.type !== "ArrayExpression" ||
      dependencies.elements.length !== 1 ||
      !isIdentifier(dependencies.elements[0], "visible")
    ) {
      return false;
    }
    const statement = callback.body.body[0];
    const test =
      statement.type === "IfStatement" ? unwrap(statement.test) : null;
    const block =
      statement.type === "IfStatement" ? statement.consequent : null;
    return (
      test?.type === "UnaryExpression" &&
      test.operator === "!" &&
      isIdentifier(test.argument, "visible") &&
      exactResetBlock(block, false)
    );
  });
  if (!resetEffect || effects.length !== 1)
    findings.push(
      "visibility effect must directly clear category and note when the sheet closes",
    );
};
const validateSubmitHandler = (renderRoot, findings, bindings) => {
  const sendButtons = jsxElements(renderRoot, "TouchableOpacity", bindings).filter(
    (element) => literalStrings(element).includes("Send Report"),
  );
  if (sendButtons.length !== 1) {
    findings.push("exactly one Send Report action must exist");
    return;
  }
  const button = sendButtons[0];
  const handler = jsxAttributeExpression(button, "onPress");
  if (
    handler?.type !== "ArrowFunctionExpression" ||
    handler.body?.type !== "BlockStatement" ||
    handler.body.body.length !== 3 || handler.body.body.slice(0, 2).some((entry) =>
      entry.type !== "VariableDeclaration" || entry.declarations.length !== 1)
  ) {
    findings.push("Send Report must use a bound block handler");
    return;
  }
  if (
    jsxAttributeString(button, "accessibilityRole") !== "button" ||
    !exactBusyStyle(button, "primaryButton") ||
    !isIdentifier(jsxAttributeExpression(button, "disabled"), "busy")
  ) {
    findings.push(
      "Send Report accessibility and disabled state must be bound to the action",
    );
  }
  const actionState = jsxAttributeExpression(button, "accessibilityState");
  if (
    !isIdentifier(objectPropertyValue(actionState, "disabled"), "busy") ||
    !isIdentifier(objectPropertyValue(actionState, "busy"), "busy")
  ) {
    findings.push(
      "Send Report accessibility state must reflect its busy/disabled authority",
    );
  }
  const selectedCategory = directVariable(handler.body, "selectedCategoryNote");
  const categoryTemplate = unwrap(selectedCategory?.init);
  if (
    categoryTemplate?.type !== "TemplateLiteral" ||
    categoryTemplate.expressions.length !== 1 ||
    !memberMatches(
      categoryTemplate.expressions[0],
      "categoryOption",
      "label",
    ) ||
    (categoryTemplate.quasis[0].value.cooked ??
      categoryTemplate.quasis[0].value.raw) !== "Selected report category: " ||
    (categoryTemplate.quasis[1].value.cooked ??
      categoryTemplate.quasis[1].value.raw) !== "."
  ) {
    findings.push(
      "submitted category note must contain only the selected customer category label",
    );
  }
  const normalizedNote = unwrap(
    directVariable(handler.body, "normalizedNote")?.init,
  );
  if (
    normalizedNote?.type !== "CallExpression" ||
    !memberMatches(normalizedNote.callee, "note", "trim") ||
    normalizedNote.arguments.length !== 0
  ) {
    findings.push("submitted free-form note must be the trimmed note state");
  }
  const submitCall = directCall(handler.body, "onSubmit");
  const payload = unwrap(submitCall?.arguments?.[0]);
  if (
    !submitCall ||
    submitCall.arguments.length !== 1 ||
    payload?.type !== "ObjectExpression"
  ) {
    findings.push("Send Report must directly call onSubmit with one payload");
    return;
  }
  if (
    !memberMatches(
      objectPropertyValue(payload, "category"),
      "categoryOption",
      "backedCategory",
    )
  ) {
    findings.push(
      "onSubmit category must be bound to categoryOption.backedCategory",
    );
  }
  const noteValue = objectPropertyValue(payload, "note");
  if (
    noteValue?.type !== "ConditionalExpression" ||
    !isIdentifier(noteValue.test, "normalizedNote") ||
    !isIdentifier(noteValue.alternate, "selectedCategoryNote")
  ) {
    findings.push(
      "onSubmit note must use the selected category note and optional normalized user note",
    );
  } else {
    const combined = unwrap(noteValue.consequent);
    if (
      combined?.type !== "TemplateLiteral" ||
      combined.expressions.length !== 2 ||
      !isIdentifier(combined.expressions[0], "selectedCategoryNote") ||
      !isIdentifier(combined.expressions[1], "normalizedNote") ||
      (combined.quasis[1].value.cooked ?? combined.quasis[1].value.raw) !== "\n"
    ) {
      findings.push(
        "onSubmit note composition must preserve category then normalized user note",
      );
    }
  }
};
export const validateReportSheetSource = (source, { enforceReleaseHash = true } = {}) => {
  const findings = [];
  if (enforceReleaseHash && createHash("sha256").update(source).digest("hex") !== REPORT_SHEET_RELEASE_SHA256)
    findings.push("report sheet differs from the exact reviewed release-candidate source");
  let ast;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
  } catch (error) {
    return [
      `report sheet did not parse: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  const program = ast.program;
  const programBindings = collectBindings(program.body);
  const reportSheet = findReportSheet(program);
  if (!reportSheet)
    return ["exported ReportSheet function declaration is missing"];
  if (JSON.stringify(reportSheet.params[0]?.properties?.map((entry) => entry.key?.name)) !==
    JSON.stringify(["visible", "title", "description", "busy", "onSubmit", "onClose"]))
    findings.push("ReportSheet must bind the exact reviewed property interface");
  const variableNames = reportSheet.body.body.filter((entry) => entry.type === "VariableDeclaration")
    .flatMap((entry) => entry.declarations.map((item) => item.id.type === "Identifier" ? item.id.name :
      item.id.elements.map((part) => part?.name).join(",")));
  if (JSON.stringify(variableNames) !== JSON.stringify(["router", "insets", "categoryKey,setCategoryKey", "note,setNote", "categoryOption", "closeAndReset"]))
    findings.push("ReportSheet must retain only the reviewed state and handler bindings");
  const functionBindings = collectBindings(reportSheet.body.body);
  const allBindings = new Map([...programBindings, ...functionBindings]);
  const returnStatements = reportSheet.body.body.filter(
    (statement) => statement.type === "ReturnStatement",
  );
  const renderRoot = unwrap(returnStatements[0]?.argument);
  if (
    returnStatements.length !== 1 ||
    returnStatements[0] !== reportSheet.body.body.at(-1) ||
    reportSheet.body.body.some((statement) =>
      !["VariableDeclaration", "ExpressionStatement", "ReturnStatement"].includes(statement.type),
    ) ||
    reportSheet.body.body.filter((statement) => statement.type === "ExpressionStatement").length !== 1 ||
    renderRoot?.type !== "JSXElement" ||
    jsxName(renderRoot) !== "Modal"
  ) {
    findings.push("ReportSheet must directly return one reachable Modal tree");
  }
  const helperText = staticString(
    programBindings.get("REPORT_SHEET_HELPER_TEXT"),
    programBindings,
  );
  if (
    !helperText?.includes("Your report goes to the moderation team") ||
    !helperText.includes(
      "Your identity stays private from the reported person by default",
    ) ||
    !helperText.includes("A report does not remove content automatically")
  ) {
    findings.push(
      "customer-safe destination, privacy, and non-enforcement copy must share one bound helper constant",
    );
  }
  if (unsafeRoutingCopy(helperText ?? "")) {
    findings.push(
      "rendered helper copy must not claim client-owned moderation routing",
    );
  }
  const goodFaithText = staticString(
    programBindings.get("REPORT_SHEET_GOOD_FAITH_TEXT"),
    programBindings,
  );
  if (!goodFaithText?.includes("Please report in good faith")) {
    findings.push(
      "good-faith guidance must remain bound to its rendered constant",
    );
  }
  const textElements = jsxElements(renderRoot, "Text", allBindings);
  const renderedCopy = textElements.map((element) => renderedTextSkeleton(element, allBindings));
  for (const copy of renderedCopy) {
    if (unsafeRoutingCopy(copy)) findings.push("rendered copy must not claim client-owned moderation routing");
    if (unsafePrivacyCopy(copy)) findings.push("rendered copy must not contradict reporter privacy doctrine");
  }
  if (unsafeRoutingCopy(renderedCopy.join(" ")) || unsafePrivacyCopy(renderedCopy.join(" ")))
    findings.push("combined rendered copy must preserve moderation routing and reporter privacy");
  if (
    textElements.filter((element) =>
      jsxRendersIdentifier(element, "REPORT_SHEET_HELPER_TEXT", allBindings) &&
      memberMatches(jsxAttributeExpression(element, "style"), "styles", "helperText") &&
      element.openingElement.attributes.length === 1,
    ).length !== 1
  ) {
    findings.push(
      "customer-safe report explanation must be rendered by ReportSheet",
    );
  }
  if (
    textElements.filter((element) =>
      jsxRendersIdentifier(element, "REPORT_SHEET_GOOD_FAITH_TEXT", allBindings) &&
      memberMatches(jsxAttributeExpression(element, "style"), "styles", "helperText"),
    ).length !== 1
  ) {
    findings.push("good-faith guidance must be rendered by ReportSheet");
  }
  if (programBindings.has("useRouter") || !callMatches(directVariable(reportSheet.body, "router")?.init, "useRouter") ||
    !callMatches(directVariable(reportSheet.body, "insets")?.init, "useSafeAreaInsets")) {
    findings.push("ReportSheet must directly bind safe-area insets");
  }
  validateStyleContract(programBindings, findings);
  validateVisibilityReset(reportSheet, findings);
  const categorySelection = unwrap(directVariable(reportSheet.body, "categoryOption")?.init);
  const finder = unwrap(categorySelection?.left);
  const findCallee = unwrap(finder?.callee);
  const findCallback = unwrap(finder?.arguments?.[0]);
  const findTest = unwrap(findCallback?.body);
  const fallback = unwrap(categorySelection?.right);
  if (categorySelection?.type !== "LogicalExpression" || categorySelection.operator !== "??" ||
    finder?.type !== "CallExpression" || !isIdentifier(findCallee?.object, "REPORT_SHEET_CATEGORY_OPTIONS") ||
    unwrap(findCallee?.property)?.name !== "find" || findCallback?.type !== "ArrowFunctionExpression" ||
    findCallback.params.length !== 1 || !isIdentifier(findCallback.params[0], "entry") ||
    findTest?.type !== "BinaryExpression" || findTest.operator !== "===" ||
    !memberMatches(findTest.left, "entry", "key") || !isIdentifier(findTest.right, "categoryKey") ||
    fallback?.type !== "MemberExpression" || !isIdentifier(fallback.object, "REPORT_SHEET_CATEGORY_OPTIONS") ||
    unwrap(fallback.property)?.value !== 0)
    findings.push("selected report option must be looked up from categoryKey with the canonical fallback");
  const stateCalls = { setCategoryKey: 0, setNote: 0 };
  walk(reportSheet.body, (node) => {
    if (callMatches(node, "setCategoryKey")) stateCalls.setCategoryKey += 1;
    if (callMatches(node, "setNote")) stateCalls.setNote += 1;
  });
  if (stateCalls.setCategoryKey !== 3 || stateCalls.setNote !== 2)
    findings.push("report state must have only the canonical selection and reset writers");
  if ([...functionBindings.values()].some((value) =>
    isIdentifier(value, "setCategoryKey") || isIdentifier(value, "setNote")))
    findings.push("report state setters must not be aliased to unreviewed writers");
  const closeAndReset = unwrap(
    directVariable(reportSheet.body, "closeAndReset")?.init,
  );
  if (
    closeAndReset?.type !== "ArrowFunctionExpression" ||
    closeAndReset.body?.type !== "BlockStatement"
  ) {
    findings.push("closeAndReset must be a direct ReportSheet block handler");
  } else if (!exactBusyCloseBlock(closeAndReset.body)) {
    findings.push(
      "closeAndReset must ignore busy dismissal, then clear category/note before calling onClose",
    );
  }
  const modals = jsxElements(renderRoot, "Modal", allBindings);
  if (
    modals.length !== 1 ||
    !isIdentifier(jsxAttributeExpression(modals[0], "visible"), "visible") ||
    !isIdentifier(
      jsxAttributeExpression(modals[0], "onRequestClose"),
      "closeAndReset",
    )
  ) {
    findings.push("native modal dismissal must be bound to closeAndReset");
  }
  const touchables = jsxElements(renderRoot, "TouchableOpacity", allBindings);
  if (touchables.length !== 5)
    findings.push("report sheet must retain only the canonical action inventory");
  const backdrop = touchables.find((element) =>
    memberMatches(
      jsxAttributeExpression(element, "style"),
      "StyleSheet",
      "absoluteFillObject",
    ),
  );
  if (
    !backdrop ||
    !isIdentifier(
      jsxAttributeExpression(backdrop, "onPress"),
      "closeAndReset",
    ) ||
    !isIdentifier(jsxAttributeExpression(backdrop, "disabled"), "busy") ||
    unwrap(jsxAttributeExpression(backdrop, "accessible"))?.value !== false
  ) {
    findings.push(
      "backdrop dismissal must be non-focusable and bound to closeAndReset",
    );
  }
  const cancelButtons = touchables.filter((element) =>
    literalStrings(element).includes("Cancel"),
  );
  if (
    cancelButtons.length !== 1 ||
    !isIdentifier(
      jsxAttributeExpression(cancelButtons[0], "onPress"),
      "closeAndReset",
    ) ||
    jsxAttributeString(cancelButtons[0], "accessibilityRole") !== "button" ||
    !exactBusyStyle(cancelButtons[0], "secondaryButton") ||
    jsxAttributeString(cancelButtons[0], "accessibilityLabel") !==
      "Cancel report" ||
    !isIdentifier(
      jsxAttributeExpression(cancelButtons[0], "disabled"),
      "busy",
    ) ||
    !isIdentifier(
      objectPropertyValue(
        jsxAttributeExpression(cancelButtons[0], "accessibilityState"),
        "disabled",
      ),
      "busy",
    )
  ) {
    findings.push(
      "visible Cancel action must be accessible and bound to closeAndReset",
    );
  }
  const copyrightButtons = touchables.filter((element) =>
    literalStrings(element).includes("Open Copyright Report"),
  );
  const copyrightButton = copyrightButtons[0];
  const copyrightConditions = [];
  walk(renderRoot, (node) => {
    if (node.type === "ConditionalExpression" &&
      literalStrings(node.consequent).includes("Open Copyright Report"))
      copyrightConditions.push(node);
  }, allBindings);
  const copyrightTest = unwrap(copyrightConditions[0]?.test);
  const copyrightHandler = jsxAttributeExpression(copyrightButton, "onPress");
  const copyrightGuard = copyrightHandler?.body?.body?.[0];
  if (
    copyrightButtons.length !== 1 ||
    copyrightConditions.length !== 1 ||
    copyrightTest?.type !== "BinaryExpression" || copyrightTest.operator !== "===" ||
    !memberMatches(copyrightTest.left, "categoryOption", "backedCategory") ||
    staticString(copyrightTest.right, new Map()) !== "copyright" ||
    copyrightHandler?.body?.type !== "BlockStatement" ||
    copyrightHandler.body.body.length !== 3 ||
    !exactBusyStyle(copyrightButton, "formalNoticeButton") ||
    !isIdentifier(jsxAttributeExpression(copyrightButton, "disabled"), "busy") ||
    !isIdentifier(
      objectPropertyValue(
        jsxAttributeExpression(copyrightButton, "accessibilityState"),
        "disabled",
      ),
      "busy",
    ) ||
    copyrightGuard?.type !== "IfStatement" ||
    !isIdentifier(copyrightGuard.test, "busy") ||
    copyrightGuard.consequent?.type !== "ReturnStatement" ||
    copyrightGuard.consequent.argument ||
    copyrightGuard.alternate ||
    !statementCall(copyrightHandler.body.body[1], "closeAndReset") ||
    !memberMatches(
      unwrap(copyrightHandler.body.body[2]?.expression)?.callee,
      "router",
      "push",
    ) ||
    staticString(
      unwrap(copyrightHandler.body.body[2]?.expression)?.arguments?.[0],
      new Map(),
    ) !== "/copyright-report"
  ) {
    findings.push(
      "copyright navigation must bind its touch style and reject busy activation",
    );
  }
  const keyboardViews = jsxElements(renderRoot, "KeyboardAvoidingView", allBindings);
  if (
    keyboardViews.length !== 1 ||
    !memberMatches(
      jsxAttributeExpression(keyboardViews[0], "style"),
      "styles",
      "keyboardAvoider",
    ) ||
    !exactPlatformKeyboardBehavior(
      jsxAttributeExpression(keyboardViews[0], "behavior"),
    ) ||
    jsxAttribute(keyboardViews[0], "enabled") ||
    jsxAttribute(keyboardViews[0], "pointerEvents")
  ) {
    findings.push(
      "rendered sheet must use exact iOS/Android keyboard avoidance",
    );
  }
  const sheetViews = jsxElements(renderRoot, "View", allBindings).filter((element) =>
    memberMatches(jsxAttributeExpression(element, "style"), "styles", "sheet"),
  );
  if (
    sheetViews.length !== 1 ||
    jsxAttribute(sheetViews[0], "accessibilityViewIsModal")?.value !== null
  ) {
    findings.push("rendered sheet must expose a modal accessibility boundary");
  }
  const verticalScrollers = jsxElements(renderRoot, "ScrollView", allBindings).filter(
    (element) =>
      memberMatches(
        jsxAttributeExpression(element, "style"),
        "styles",
        "sheetScroller",
      ),
  );
  if (verticalScrollers.length !== 1) {
    findings.push("rendered sheet must have one bounded vertical scroller");
  } else {
    const scroller = verticalScrollers[0];
    const contentStyle = jsxAttributeExpression(scroller, "contentContainerStyle");
    const insetStyle = contentStyle?.type === "ArrayExpression"
      ? unwrap(contentStyle.elements[1]) : null;
    const hasExactContentStyle =
      contentStyle?.type === "ArrayExpression" &&
      contentStyle.elements.length === 2 &&
      memberMatches(contentStyle.elements[0], "styles", "sheetContent") &&
      insetStyle?.type === "ObjectExpression" &&
      insetStyle.properties.length === 3 &&
      exactInset(objectPropertyValue(insetStyle, "paddingBottom"), "bottom", 16) &&
      exactInset(objectPropertyValue(insetStyle, "paddingLeft"), "left", 18) &&
      exactInset(objectPropertyValue(insetStyle, "paddingRight"), "right", 18);
    if (
      !hasExactContentStyle ||
      jsxAttributeString(scroller, "keyboardShouldPersistTaps") !== "handled"
    ) {
      findings.push(
        "vertical scroller must bind exact bottom/left/right safe areas with no later style override",
      );
    }
  }
  const categoryButtons = touchables.filter(
    (element) => jsxAttributeString(element, "accessibilityRole") === "radio",
  );
  if (categoryButtons.length !== 1) {
    findings.push(
      "mapped category control must expose radio semantics exactly once in source",
    );
  } else {
    const categoryButton = categoryButtons[0];
    const categoryState = jsxAttributeExpression(categoryButton, "accessibilityState");
    const selectedState = objectPropertyValue(categoryState, "selected");
    const categoryDisabledState = objectPropertyValue(categoryState, "disabled");
    const categoryStyle = jsxAttributeExpression(categoryButton, "style");
    const activeStyle = unwrap(categoryStyle?.elements?.[1]);
    const disabledStyle = unwrap(categoryStyle?.elements?.[2]);
    const categoryPress = jsxAttributeExpression(categoryButton, "onPress");
    if (
      !memberMatches(
        jsxAttributeExpression(categoryButton, "accessibilityLabel"),
        "entry",
        "label",
      ) ||
      categoryStyle?.type !== "ArrayExpression" ||
      categoryStyle.elements.length !== 3 ||
      !memberMatches(categoryStyle.elements[0], "styles", "categoryChip") ||
      activeStyle?.type !== "LogicalExpression" ||
      activeStyle.operator !== "&&" ||
      unwrap(activeStyle.left)?.operator !== "===" ||
      !isIdentifier(unwrap(activeStyle.left)?.left, "categoryKey") ||
      !memberMatches(unwrap(activeStyle.left)?.right, "entry", "key") ||
      !memberMatches(activeStyle.right, "styles", "categoryChipActive") ||
      disabledStyle?.type !== "LogicalExpression" ||
      !isIdentifier(disabledStyle.left, "busy") ||
      !memberMatches(disabledStyle.right, "styles", "buttonDisabled") ||
      !memberMatches(
        jsxAttributeExpression(categoryButton, "accessibilityHint"),
        "entry",
        "description",
      ) ||
      selectedState?.type !== "BinaryExpression" ||
      selectedState.operator !== "===" ||
      !isIdentifier(selectedState.left, "categoryKey") ||
      !memberMatches(selectedState.right, "entry", "key") ||
      !isIdentifier(categoryDisabledState, "busy") ||
      !isIdentifier(
        jsxAttributeExpression(categoryButton, "disabled"),
        "busy",
      ) ||
      categoryPress?.type !== "ArrowFunctionExpression" ||
      !callMatches(categoryPress.body, "setCategoryKey") ||
      !memberMatches(categoryPress.body.arguments?.[0], "entry", "key")
    ) {
      findings.push(
        "category labels, hints, and selected state must be bound to each mapped option",
      );
    }
  }
  const noteInputs = jsxElements(renderRoot, "TextInput", allBindings).filter(
    (element) => isIdentifier(jsxAttributeExpression(element, "value"), "note"),
  );
  const editable = jsxAttributeExpression(noteInputs[0], "editable");
  if (
    noteInputs.length !== 1 ||
    !isIdentifier(jsxAttributeExpression(noteInputs[0], "onChangeText"), "setNote") ||
    jsxAttributeString(noteInputs[0], "accessibilityLabel") !==
      "Optional report details" ||
    !jsxAttributeString(noteInputs[0], "accessibilityHint") ||
    editable?.type !== "UnaryExpression" ||
    editable.operator !== "!" ||
    !isIdentifier(editable.argument, "busy")
  ) {
    findings.push(
      "optional report details input must bind note state, accessible guidance, and busy state",
    );
  }
  validateSubmitHandler(renderRoot, findings, allBindings);
  const optionsInitializer = programBindings.get(
    "REPORT_SHEET_CATEGORY_OPTIONS",
  );
  const optionTuples = unwrap(optionsInitializer)?.elements?.map((entry) =>
    ["key", "label", "description", "backedCategory"].map((name) =>
      staticString(objectPropertyValue(entry, name), programBindings),
    ).join("|"),
  );
  const expectedOptionTuples = "harassment_bullying|Harassment or bullying|Targeted abuse, stalking, hostile contact, or repeated unwanted behavior.|harassment;hate_discrimination|Hate or discrimination|Attacks or exclusion based on protected traits, identity, or community.|abuse;threats_violence|Threats or violence|Threats, violent behavior, weapons, live danger, or immediate safety risk.|safety;sexual_exploitation|Sexual content or exploitation|Non-consensual sexual content, exploitation, or sexual safety concerns.|safety;self_harm_danger|Self-harm or dangerous behavior|Self-harm, suicide, dangerous behavior, or a live emergency concern.|safety;minor_safety|Minor safety|Child/minor safety, exploitation, grooming, or age-related risk.|safety;illegal_activity|Illegal activity|Illegal goods, criminal activity, exploitation, or severe platform abuse.|safety;spam_scam|Spam or scam|Spam, phishing, malware, fake giveaways, or manipulative promotion.|safety;impersonation|Impersonation|Fake person, creator, brand, official account, or false affiliation.|impersonation;privacy_doxxing|Privacy violation/doxxing|Private information, doxxing, unwanted personal data, or privacy invasion.|safety;copyright_dmca|Copyright/DMCA|Copyright, stolen media, unauthorized upload, or formal rights concern.|copyright;deceptive_content|Misinformation or deceptive content|Deceptive claims, misleading identity, or harmful false context.|other;graphic_violent_content|Graphic/violent content|Graphic injury, gore, violent imagery, or shocking unsafe content.|safety;fraud_payment|Fraud/payment concern|Suspicious paid access, refund/access issue, or payment-related abuse.|safety;live_safety|Live safety issue|Unsafe live behavior, room abuse, dangerous participant, or live disruption.|safety;other|Other|Something else that needs moderation review.|other".split(";");
  if (JSON.stringify(optionTuples) !== JSON.stringify(expectedOptionTuples))
    findings.push("report options must retain the exact unique customer-to-backend mapping");
  const categoryMaps = [];
  let pressHandlers = 0;
  walk(renderRoot, (node) => {
    if (node.type === "JSXSpreadAttribute")
      findings.push("protected report UI must not use effective-prop JSX spreads");
    if (node.type === "JSXAttribute" && node.name?.name === "pointerEvents") findings.push("report UI must not disable interaction through pointerEvents");
    if (node.type === "JSXAttribute" && node.name?.name === "contentInset") findings.push("report UI must not override canonical safe-area placement");
    if (node.type === "JSXAttribute" && ["accessibilityElementsHidden", "importantForAccessibility"].includes(node.name?.name))
      findings.push("report UI must not hide reviewed controls from assistive technology");
    if (node.type === "JSXAttribute" && node.name?.name === "onPress") pressHandlers += 1;
    if (node.type === "JSXAttribute" && /^on[A-Z]/.test(node.name?.name ?? "") &&
      !["onPress", "onRequestClose", "onChangeText"].includes(node.name.name))
      findings.push("report UI must not add unreviewed action handlers");
    const callee = unwrap(node?.callee);
    const property = callee?.computed
      ? unwrap(callee.property)?.value
      : unwrap(callee?.property)?.name;
    if (node.type === "CallExpression" && callee?.type === "MemberExpression" &&
      isIdentifier(callee.object, "REPORT_SHEET_CATEGORY_OPTIONS") && property === "map")
      categoryMaps.push(node);
  }, allBindings);
  if (categoryMaps.length !== 1) findings.push("rendered category controls must map the canonical options exactly once"); const categoryCallback = unwrap(categoryMaps[0]?.arguments?.[0]);
  if (categoryCallback?.type !== "ArrowFunctionExpression" || categoryCallback.params.length !== 1 ||
    !isIdentifier(categoryCallback.params[0], "entry") ||
    jsxElements(categoryCallback.body, "TouchableOpacity", allBindings)[0] !== categoryButtons[0])
    findings.push("category controls must bind the canonical map entry callback");
  if (pressHandlers !== 5) findings.push("report UI must retain exactly five reviewed press handlers"); walk(optionsInitializer, (node) => {
    if (node.type !== "ObjectProperty") return;
    const key = node.computed
      ? unwrap(node.key)?.value
      : (node.key?.name ?? node.key?.value);
    if (key === "queue") {
      findings.push(
        "category options must not declare client-owned queue routing",
      );
    }
  });
  walk(renderRoot, (node) => {
    if (
      (node.type === "MemberExpression" ||
        node.type === "OptionalMemberExpression") &&
      ((node.computed && unwrap(node.property)?.value === "queue") ||
        (!node.computed && unwrap(node.property)?.name === "queue"))
    ) {
      findings.push("ReportSheet must not read a client-owned queue property");
    }
    if (node.type === "ObjectProperty") {
      const key = node.computed
        ? unwrap(node.key)?.value
        : (node.key?.name ?? node.key?.value);
      if (key === "queue")
        findings.push(
          "ReportSheet must not declare client-owned queue routing",
        );
    }
    if (
      ["StringLiteral", "JSXText", "TemplateLiteral", "BinaryExpression", "CallExpression", "Identifier"].includes(
        node.type,
      )
    ) {
      const candidate = stringSkeleton(node, allBindings)
        .replace(/\s+/g, " ")
        .trim();
      if (
        unsafeRoutingCopy(candidate)
      ) {
        findings.push(
          "ReportSheet must not render or submit client-invented moderation routing",
        );
      }
      if (
        unsafePrivacyCopy(candidate)
      ) {
        findings.push(
          "ReportSheet must not contradict reporter privacy or notification doctrine",
        );
      }
    }
  }, allBindings);
  return [...new Set(findings)];
};
