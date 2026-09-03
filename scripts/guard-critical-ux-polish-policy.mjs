#!/usr/bin/env node
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
const traverse = traverseModule.default ?? traverseModule;
const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const moduleResolvesTo = (specifier, sourceFile, target) => path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), specifier)) === target;
const fail = (message) => { console.error(`Critical UX polish policy guard failed: ${message}`); process.exitCode = 1; };
const assertIncludes = (source, needle, label) => { if (!source.includes(needle)) fail(`${label} is missing ${needle}`); };
const assertNotIncludes = (source, needle, label) => { if (source.includes(needle)) fail(`${label} must not include ${needle}`); };
const getPropertyName = (pathValue) => {
  if (!pathValue?.isMemberExpression?.() && !pathValue?.isOptionalMemberExpression?.()) return "";
  const property = pathValue.get("property");
  return !pathValue.node.computed && property.isIdentifier() ? property.node.name : getStaticString(property) ?? "";
};
const getBindingByName = (sourcePath, name) => {
  for (let current = sourcePath; current; current = current.parentPath) {
    const binding = current.scope?.getBinding(name); if (binding) return binding;
  }
  return null;
};
const getBinding = (identifierPath) => identifierPath?.isIdentifier?.() ? getBindingByName(identifierPath, identifierPath.node.name) : null;
const isRawErrorObjectExpression = (expressionPath, rawErrorBindings, allowNameHeuristic = true) => {
  if (!expressionPath?.node) return false;
  if (expressionPath.isIdentifier()) {
    const binding = getBinding(expressionPath);
    return (binding && rawErrorBindings.has(binding))
      || (allowNameHeuristic && /error/i.test(expressionPath.node.name));
  }
  if (expressionPath.isMemberExpression() || expressionPath.isOptionalMemberExpression()) return getPropertyName(expressionPath) === "error";
  if (expressionPath.isTSAsExpression?.() || expressionPath.isTSNonNullExpression?.() || expressionPath.isTypeCastExpression?.() || expressionPath.isParenthesizedExpression?.()) return isRawErrorObjectExpression(expressionPath.get("expression"), rawErrorBindings, allowNameHeuristic);
  return false;
};
const isRawMessageMemberPath = (memberPath, rawErrorBindings) => getPropertyName(memberPath) === "message" && isRawErrorObjectExpression(memberPath.get("object"), rawErrorBindings);
const isUserFacingSanitizerExpression = (pathValue, bindings) => pathValue?.isIdentifier?.() && bindings.has(getBinding(pathValue));
const isUserFacingSanitizerCall = (callPath, bindings) => callPath?.isCallExpression?.() && isUserFacingSanitizerExpression(callPath.get("callee"), bindings);
const unwrapExpression = (expressionPath) => {
  let currentPath = expressionPath;
  while (currentPath?.node && (currentPath.isTSAsExpression?.() || currentPath.isTSSatisfiesExpression?.() || currentPath.isTSNonNullExpression?.() || currentPath.isTypeCastExpression?.() || currentPath.isParenthesizedExpression?.())) currentPath = currentPath.get("expression");
  return currentPath;
};
const expressionIsSanitizerDerived = (expressionPath, sanitizerBindings) => {
  const unwrappedPath = unwrapExpression(expressionPath);
  if (!unwrappedPath?.node) return false;
  if (isUserFacingSanitizerCall(unwrappedPath, sanitizerBindings)) return true;
  if (!unwrappedPath.isCallExpression?.() && !unwrappedPath.isOptionalCallExpression?.()) return false;
  const callee = unwrappedPath.get("callee");
  if (!callee.isMemberExpression?.() && !callee.isOptionalMemberExpression?.()) return false;
  if (!["replace", "replaceAll", "trim"].includes(getPropertyName(callee))) return false;
  if (unwrappedPath.get("arguments").some((argument) => !(argument.isStringLiteral?.() || argument.isRegExpLiteral?.()))) return false;
  return expressionIsSanitizerDerived(callee.get("object"), sanitizerBindings);
};
const functionReturnsOnlySanitizerDerivedMessages = (functionPath, sanitizerBindings) => {
  if (!functionPath?.isFunction?.()) return false;
  const body = functionPath.get("body");
  if (!body.isBlockStatement?.()) return expressionIsSanitizerDerived(body, sanitizerBindings);
  const returnExpressions = [];
  body.traverse({ Function(innerPath) { innerPath.skip(); }, ReturnStatement(returnPath) { if (returnPath.get("argument")?.node) returnExpressions.push(returnPath.get("argument")); } });
  return returnExpressions.length > 0 && returnExpressions.every((expressionPath) => expressionIsSanitizerDerived(expressionPath, sanitizerBindings));
};
const functionReturnsRawMessage = (functionPath, rawMessageBindings, rawErrorBindings, sanitizerBindings) => {
  if (!functionPath?.isFunction?.()) return false;
  const body = functionPath.get("body");
  if (!body.isBlockStatement?.()) return expressionContainsRawMessage(body, rawMessageBindings, rawErrorBindings, sanitizerBindings);
  const returnExpressions = [];
  body.traverse({ Function(innerPath) { innerPath.skip(); }, ReturnStatement(returnPath) { if (returnPath.get("argument")?.node) returnExpressions.push(returnPath.get("argument")); } });
  return returnExpressions.some((expressionPath) => expressionContainsRawMessage(expressionPath, rawMessageBindings, rawErrorBindings, sanitizerBindings));
};
const expressionContainsRawMessage = (expressionPath, rawMessageBindings, rawErrorBindings, sanitizerBindings) => {
  if (!expressionPath?.node) return false;
  if (expressionPath.isFunction?.()) return functionReturnsRawMessage(expressionPath, rawMessageBindings, rawErrorBindings, sanitizerBindings);
  if (isUserFacingSanitizerCall(expressionPath, sanitizerBindings)) return expressionPath.get("arguments").slice(1).some((argument) => expressionContainsRawMessage(argument, rawMessageBindings, rawErrorBindings, sanitizerBindings));
  if (isRawMessageMemberPath(expressionPath, rawErrorBindings)) return true;
  if (expressionPath.isIdentifier()) {
    const binding = getBinding(expressionPath);
    return !!binding && (rawMessageBindings.has(binding) || rawErrorBindings.has(binding));
  }
  let found = false;
  expressionPath.traverse({
    Function(innerPath) { if (functionReturnsRawMessage(innerPath, rawMessageBindings, rawErrorBindings, sanitizerBindings)) found = true; innerPath.skip(); },
    CallExpression(innerPath) {
      if (isUserFacingSanitizerCall(innerPath, sanitizerBindings)) {
        if (innerPath.get("arguments").slice(1).some((argument) => expressionContainsRawMessage(argument, rawMessageBindings, rawErrorBindings, sanitizerBindings))) found = true;
        innerPath.skip();
      }
    },
    MemberExpression(innerPath) { if (isRawMessageMemberPath(innerPath, rawErrorBindings)) { found = true; innerPath.stop(); } },
    OptionalMemberExpression(innerPath) { if (isRawMessageMemberPath(innerPath, rawErrorBindings)) { found = true; innerPath.stop(); } },
    Identifier(innerPath) {
      const binding = getBinding(innerPath);
      if (binding && (rawMessageBindings.has(binding) || rawErrorBindings.has(binding))) { found = true; innerPath.stop(); }
    },
  });
  return found;
};
const getPatternBindings = (patternPath) => {
  if (!patternPath?.node) return [];
  if (patternPath.isIdentifier()) {
    const binding = getBinding(patternPath);
    return binding ? [binding] : [];
  }
  if (patternPath.isAssignmentPattern()) return getPatternBindings(patternPath.get("left"));
  if (patternPath.isRestElement()) return getPatternBindings(patternPath.get("argument"));
  return patternPath.getBindingIdentifiers ? Object.keys(patternPath.getBindingIdentifiers()).flatMap((name) => { const binding = getBindingByName(patternPath, name); return binding ? [binding] : []; }) : [];
};
const getStaticString = (expressionPath, seen = new Set()) => {
  expressionPath = unwrapExpression(expressionPath);
  if (expressionPath?.isStringLiteral?.()) return expressionPath.node.value;
  if (expressionPath?.isTemplateLiteral?.() && expressionPath.get("expressions").length === 0) return expressionPath.node.quasis[0]?.value.cooked ?? "";
  if (expressionPath?.isBinaryExpression?.({ operator: "+" })) {
    const left = getStaticString(expressionPath.get("left"), seen); const right = getStaticString(expressionPath.get("right"), seen);
    return left === null || right === null ? null : left + right;
  }
  if (!expressionPath?.isIdentifier?.()) return null;
  const binding = getBinding(expressionPath);
  if (!binding?.constant || seen.has(binding)) return null;
  seen.add(binding);
  const owner = binding.path.isVariableDeclarator?.() ? binding.path : binding.path.parentPath;
  return owner?.isVariableDeclarator?.() ? getStaticString(owner.get("init"), seen) : null;
};
const objectPatternRawErrorBindings = (patternPath) => {
  if (patternPath?.isAssignmentPattern?.()) return objectPatternRawErrorBindings(patternPath.get("left"));
  if (!patternPath?.isObjectPattern?.()) return [];
  return patternPath.get("properties").flatMap((propertyPath) => {
    if (!propertyPath.isObjectProperty()) return [];
    const key = propertyPath.get("key");
    const keyName = propertyPath.node.computed ? getStaticString(key) : key.isIdentifier() ? key.node.name : getStaticString(key);
    return keyName === "error" ? getPatternBindings(propertyPath.get("value")) : [];
  });
};
const objectPatternMessageBindings = (patternPath, sourceIsRawErrorObject) => {
  if (patternPath?.isAssignmentPattern?.()) return objectPatternMessageBindings(patternPath.get("left"), sourceIsRawErrorObject);
  if (!patternPath?.isObjectPattern?.()) return [];
  return patternPath.get("properties").flatMap((propertyPath) => {
    if (!propertyPath.isObjectProperty()) return [];
    const key = propertyPath.get("key");
    const value = propertyPath.get("value");
    const keyName = propertyPath.node.computed ? getStaticString(key) : key.isIdentifier() ? key.node.name : getStaticString(key);
    if (keyName === "message" && sourceIsRawErrorObject) return getPatternBindings(value);
    if (keyName === "error" && value.isObjectPattern()) return objectPatternMessageBindings(value, true);
    return [];
  });
};
const isDirectPresentationExpression = (expressionPath, presentationBindings, seen = new Set()) => {
  expressionPath = unwrapExpression(expressionPath);
  if (!expressionPath?.node) return false;
  if (expressionPath.isLogicalExpression?.()) return isDirectPresentationExpression(expressionPath.get("left"), presentationBindings, seen)
    || isDirectPresentationExpression(expressionPath.get("right"), presentationBindings, seen);
  if (expressionPath.isArrayExpression?.()) return expressionPath.get("elements").some((item) => isDirectPresentationExpression(item, presentationBindings, seen));
  if (expressionPath.isObjectExpression?.()) return expressionPath.get("properties").some((property) => (
    property.isObjectMethod?.() || property.isObjectProperty?.()
  ) && isDirectPresentationExpression(property.isObjectMethod?.() ? property : property.get("value"), presentationBindings, seen));
  if (expressionPath.isCallExpression?.() || expressionPath.isOptionalCallExpression?.() || expressionPath.isNewExpression?.()) {
    const callee = unwrapExpression(expressionPath.get("callee"));
    if ((callee?.isMemberExpression?.() || callee?.isOptionalMemberExpression?.())
      && getPropertyName(callee) === "bind"
      && isDirectPresentationExpression(callee.get("object"), presentationBindings, seen)) return true;
    return isDirectPresentationExpression(callee, presentationBindings, seen)
      || expressionPath.get("arguments").some((item) => isDirectPresentationExpression(item, presentationBindings, seen));
  }
  if (expressionPath.isConditionalExpression?.()) return isDirectPresentationExpression(expressionPath.get("consequent"), presentationBindings, seen)
    || isDirectPresentationExpression(expressionPath.get("alternate"), presentationBindings, seen);
  if (expressionPath.isSequenceExpression?.()) return expressionPath.get("expressions").some((item) => isDirectPresentationExpression(item, presentationBindings, seen));
  if (expressionPath.isIdentifier()) {
    const binding = getBinding(expressionPath);
    if (binding && !seen.has(binding)) {
      seen.add(binding);
      const owner = binding.path.isVariableDeclarator?.() ? binding.path : binding.path.parentPath;
      if (owner?.isVariableDeclarator?.() && isDirectPresentationExpression(owner.get("init"), presentationBindings, seen)) return true;
    }
    return /^set.*(?:Error|Notice|Feedback|Status|Message)$/i.test(expressionPath.node.name)
      || (!!binding && presentationBindings.has(binding));
  }
  if (!expressionPath.isMemberExpression() && !expressionPath.isOptionalMemberExpression()) return false;
  if (["call", "apply", "bind"].includes(getPropertyName(expressionPath))) {
    return isDirectPresentationExpression(expressionPath.get("object"), presentationBindings, seen);
  }
  const object = unwrapExpression(expressionPath.get("object"));
  const objectBinding = getBinding(object);
  if (objectBinding && presentationBindings.has(objectBinding)) return true;
  if (/^set.*(?:Error|Notice|Feedback|Status|Message)$/i.test(getPropertyName(expressionPath))) return true;
  const installed = objectBinding?.referencePaths?.some((reference) => {
    const call = reference.parentPath?.isCallExpression?.() ? reference.parentPath : reference.findParent?.((item) => item.isCallExpression?.());
    const callee = unwrapExpression(call?.get("callee"));
    const args = call?.get("arguments") ?? [];
    if (getPropertyName(callee) !== "defineProperty" || !unwrapExpression(callee?.get("object"))?.isIdentifier?.({ name: "Object" })
      || getBinding(unwrapExpression(args[0])) !== objectBinding || getStaticString(args[1]) !== getPropertyName(expressionPath)) return false;
    const config = unwrapExpression(args[2]);
    const value = config?.isObjectExpression?.() ? config.get("properties").find((item) => getPropertyName(item) === "value" || item.get("key")?.isIdentifier?.({ name: "value" })) : null;
    return value?.isObjectProperty?.() && isDirectPresentationExpression(value.get("value"), presentationBindings, new Set(seen));
  });
  if (installed) return true;
  if (!object?.isIdentifier?.() && isDirectPresentationExpression(object, presentationBindings, seen)) return true;
  return getPropertyName(expressionPath) === "alert"
    && object?.isIdentifier({ name: "Alert" });
};
const collectCustomerErrorBoundaryViolations = (source, file, sourceFile) => {
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
  const rawErrorBindings = new Set();
  const rawResultBindings = new Set();
  const rawMessageBindings = new Set();
  const presentationBindings = new Set();
  const sanitizerBindings = new Set();
  const functionDeclarations = [];
  const classDeclarations = [];
  const assignmentPatterns = [];
  const declarators = [];
  const assignments = [];
  const promiseCalls = [];
  const addRawErrorBinding = (binding) => { rawErrorBindings.add(binding); rawMessageBindings.add(binding); };
  const isUntrustedResultExpression = (expressionPath) => {
    expressionPath = unwrapExpression(expressionPath);
    if (!expressionPath?.node) return false;
    if (expressionPath.isAwaitExpression()) return true;
    if (expressionPath.isIdentifier()) return rawResultBindings.has(getBinding(expressionPath));
    return false;
  };
  const resolveContainerMember = (containerPath, propertyName, seen = new Set()) => {
    containerPath = unwrapExpression(containerPath);
    if (!containerPath?.node) return null;
    const definitionName = (item) => { const key = item?.get?.("key"); return !item?.node?.computed && key?.isIdentifier?.() ? key.node.name : getStaticString(key); };
    if (containerPath.isIdentifier?.()) {
      const binding = getBinding(containerPath);
      if (!binding || seen.has(binding)) return null;
      seen.add(binding);
      const assignment = assignments.find((item) => { const left = unwrapExpression(item.get("left")); return (left?.isMemberExpression?.() || left?.isOptionalMemberExpression?.()) && getBinding(unwrapExpression(left.get("object"))) === binding && getPropertyName(left) === propertyName; });
      if (assignment) return unwrapExpression(assignment.get("right"));
      const owner = binding.path.isVariableDeclarator?.() || binding.path.isClassDeclaration?.() ? binding.path : binding.path.findParent?.((item) => item.isVariableDeclarator?.() || item.isClassDeclaration?.());
      if (owner?.isClassDeclaration?.()) return owner.get("body.body").find((item) => definitionName(item) === propertyName) ?? null;
      return owner?.isVariableDeclarator?.() ? resolveContainerMember(owner.get("init"), propertyName, seen) : null;
    }
    if (containerPath.isObjectExpression?.()) {
      const direct = [...containerPath.get("properties")].reverse().find((item) => !item.isSpreadElement?.() && definitionName(item) === propertyName);
      if (direct) { const value = direct.isObjectProperty?.() ? unwrapExpression(direct.get("value")) : direct; return value?.isAssignmentPattern?.() ? unwrapExpression(value.get("right")) : value; }
      for (const spread of [...containerPath.get("properties")].reverse()) if (spread.isSpreadElement?.()) { const value = resolveContainerMember(spread.get("argument"), propertyName, seen); if (value) return value; }
    }
    if (containerPath.isCallExpression?.() || containerPath.isOptionalCallExpression?.()) {
      const callee = unwrapExpression(containerPath.get("callee"));
      if (getPropertyName(callee) === "assign" && unwrapExpression(callee.get("object"))?.isIdentifier?.({ name: "Object" })) {
        for (const argument of containerPath.get("arguments").toReversed()) { const value = resolveContainerMember(argument, propertyName, new Set(seen)); if (value) return value; }
      }
    }
    if (containerPath.isArrayExpression?.()) { const index = Number(propertyName); return Number.isSafeInteger(index) ? unwrapExpression(containerPath.get("elements")[index]) : null; }
    if (containerPath.isNewExpression?.()) {
      const classBinding = getBinding(unwrapExpression(containerPath.get("callee")));
      const owner = classBinding?.path?.isClassDeclaration?.() ? classBinding.path : classBinding?.path?.findParent?.((item) => item.isClassDeclaration?.());
      return owner?.get("body.body").find((item) => definitionName(item) === propertyName) ?? null;
    }
    return null;
  };
  const resolvePatternBindingValue = (patternPath, sourcePath, binding, seen = new Set()) => {
    patternPath = unwrapExpression(patternPath); sourcePath = unwrapExpression(sourcePath);
    if (!patternPath?.node) return null;
    if (patternPath.isIdentifier?.()) return getBinding(patternPath) === binding ? sourcePath : null;
    if (patternPath.isAssignmentPattern?.()) return resolvePatternBindingValue(patternPath.get("left"), sourcePath, binding, seen)
      ?? (getPatternBindings(patternPath.get("left")).includes(binding) ? unwrapExpression(patternPath.get("right")) : null);
    if (patternPath.isRestElement?.()) return resolvePatternBindingValue(patternPath.get("argument"), sourcePath, binding, seen);
    if (patternPath.isArrayPattern?.()) for (const [index, item] of patternPath.get("elements").entries()) {
      const value = resolvePatternBindingValue(item, resolveContainerMember(sourcePath, String(index), new Set(seen)), binding, seen); if (value) return value;
    }
    if (patternPath.isObjectPattern?.()) for (const item of patternPath.get("properties")) {
      if (!getPatternBindings(item).includes(binding)) continue;
      if (item.isRestElement?.()) return resolvePatternBindingValue(item, sourcePath, binding, seen);
      const key = item.get("key"); const name = !item.node.computed && key.isIdentifier?.() ? key.node.name : getStaticString(key);
      return resolvePatternBindingValue(item.get("value"), resolveContainerMember(sourcePath, name, new Set(seen)), binding, seen);
    }
    return null;
  };
  const resolveCallback = (candidatePath, seen = new Set()) => {
    candidatePath = unwrapExpression(candidatePath);
    if (candidatePath?.isFunction?.()) return candidatePath;
    if (candidatePath?.isSequenceExpression?.()) {
      for (const item of candidatePath.get("expressions").toReversed()) { const resolved = resolveCallback(item, seen); if (resolved) return resolved; }
    }
    if (candidatePath?.isConditionalExpression?.() || candidatePath?.isLogicalExpression?.()) {
      for (const item of candidatePath.isConditionalExpression?.() ? [candidatePath.get("consequent"), candidatePath.get("alternate")] : [candidatePath.get("left"), candidatePath.get("right")]) { const resolved = resolveCallback(item, new Set(seen)); if (resolved) return resolved; }
    }
    if (candidatePath?.isCallExpression?.() || candidatePath?.isOptionalCallExpression?.()) {
      const callee = unwrapExpression(candidatePath.get("callee"));
      if ((callee?.isMemberExpression?.() || callee?.isOptionalMemberExpression?.()) && ["bind", "call", "apply"].includes(getPropertyName(callee))) return resolveCallback(callee.get("object"), seen);
      for (const argument of candidatePath.get("arguments")) { const resolved = resolveCallback(argument, new Set(seen)); if (resolved) return resolved; }
    }
    if (candidatePath?.isMemberExpression?.() || candidatePath?.isOptionalMemberExpression?.()) {
      const propertyName = getPropertyName(candidatePath);
      const object = unwrapExpression(candidatePath.get("object"));
      if (["bind", "call", "apply"].includes(propertyName)) return resolveCallback(object, seen);
      const objectBinding = getBinding(object);
      const owner = objectBinding?.path?.isVariableDeclarator?.() ? objectBinding.path : objectBinding?.path?.findParent?.((item) => item.isVariableDeclarator?.());
      const init = owner?.isVariableDeclarator?.() ? unwrapExpression(owner.get("init")) : null;
      const container = init?.node ? init : object;
      const memberValue = resolveContainerMember(container, propertyName);
      if (memberValue?.isFunction?.()) return memberValue;
      const memberAssignment = assignments.find((item) => {
        const left = unwrapExpression(item.get("left"));
        return (left?.isMemberExpression?.() || left?.isOptionalMemberExpression?.())
          && getPropertyName(left) === propertyName && getBinding(unwrapExpression(left.get("object"))) === objectBinding;
      });
      const assigned = unwrapExpression(memberAssignment?.get("right"));
      if (assigned?.isFunction?.()) return assigned;
    }
    const binding = getBinding(candidatePath);
    if (!binding || seen.has(binding)) return null;
    seen.add(binding);
    let owner = binding?.path;
    if (owner?.isIdentifier?.()) owner = owner.parentPath;
    if (!owner?.isVariableDeclarator?.()) owner = binding.path.findParent?.((item) => item.isVariableDeclarator?.()) ?? owner;
    if (owner?.isFunctionDeclaration?.()) return owner;
    let init = owner?.isVariableDeclarator?.() ? unwrapExpression(owner.get("init")) : null;
    const pattern = owner?.isVariableDeclarator?.() ? owner.get("id") : null;
    if (pattern?.isArrayPattern?.() || pattern?.isObjectPattern?.()) init = resolvePatternBindingValue(pattern, init, binding) ?? init;
    if (init?.isCallExpression?.() && unwrapExpression(init.get("callee"))?.isIdentifier?.({ name: "useCallback" })) init = unwrapExpression(init.get("arguments")[0]);
    if (init?.isFunction?.()) return init;
    if (init?.node) { const resolved = resolveCallback(init, seen); if (resolved) return resolved; }
    const assigned = assignments.find((item) => item.get("left").isIdentifier?.() && getBinding(item.get("left")) === binding);
    if (assigned) { const resolved = resolveCallback(assigned.get("right"), seen); if (resolved) return resolved; }
    const destructured = assignments.find((item) => (item.get("left").isObjectPattern?.() || item.get("left").isArrayPattern?.()) && getPatternBindings(item.get("left")).includes(binding));
    if (destructured) { const resolved = resolveCallback(resolvePatternBindingValue(destructured.get("left"), destructured.get("right"), binding), seen); if (resolved) return resolved; }
    if (destructured?.get("left").isObjectPattern?.()) {
      const property = destructured.get("left").get("properties").find((item) => getPatternBindings(item).includes(binding));
      const key = property?.get("key"); const name = !property?.node.computed && key?.isIdentifier?.() ? key.node.name : getStaticString(key);
      const value = resolveContainerMember(destructured.get("right"), name) ?? unwrapExpression(property?.get("value")?.get?.("right"));
      if (value?.isFunction?.()) return value;
    }
    return null;
  };
  const resolveCallbacks = (candidatePath, seen = new Set()) => {
    candidatePath = unwrapExpression(candidatePath);
    if (!candidatePath?.node) return [];
    if (candidatePath.isConditionalExpression?.()) return [candidatePath.get("consequent"), candidatePath.get("alternate")].flatMap((item) => resolveCallbacks(item, new Set(seen)));
    if (candidatePath.isLogicalExpression?.()) return [candidatePath.get("left"), candidatePath.get("right")].flatMap((item) => resolveCallbacks(item, new Set(seen)));
    if (candidatePath.isAssignmentExpression?.()) return resolveCallbacks(candidatePath.get("right"), seen);
    if (candidatePath.isMemberExpression?.() || candidatePath.isOptionalMemberExpression?.()) {
      const object = unwrapExpression(candidatePath.get("object"));
      const binding = getBinding(object); const owner = binding?.path?.isVariableDeclarator?.() ? binding.path : binding?.path?.findParent?.((item) => item.isVariableDeclarator?.()); const init = unwrapExpression(owner?.get("init"));
      const container = object?.isConditionalExpression?.() || object?.isLogicalExpression?.() ? object : init;
      if (container?.isConditionalExpression?.() || container?.isLogicalExpression?.()) return (container.isConditionalExpression?.() ? [container.get("consequent"), container.get("alternate")] : [container.get("left"), container.get("right")])
        .flatMap((item) => resolveCallbacks(resolveContainerMember(item, getPropertyName(candidatePath), new Set(seen)), new Set(seen)));
    }
    if (candidatePath.isCallExpression?.() || candidatePath.isOptionalCallExpression?.()) {
      const callee = unwrapExpression(candidatePath.get("callee")); const property = getPropertyName(callee); const object = unwrapExpression(callee?.get?.("object")); const args = candidatePath.get("arguments");
      if (property === "get" && object?.isIdentifier?.({ name: "Reflect" })) return resolveCallbacks(resolveContainerMember(args[0], getStaticString(args[1]), new Set(seen)), seen);
      if (property === "at") return resolveCallbacks(resolveContainerMember(object, args[0]?.isNumericLiteral?.() ? String(args[0].node.value) : getStaticString(args[0]), new Set(seen)), seen);
      const argumentCallbacks = args.flatMap((item) => resolveCallbacks(item, new Set(seen)));
      if (argumentCallbacks.length) return argumentCallbacks;
      const producer = resolveCallback(candidatePath.get("callee"), new Set(seen));
      if (producer) {
        const body = producer.get("body"); const returns = [];
        if (body.isBlockStatement?.()) body.traverse({ Function(pathValue) { pathValue.skip(); }, ReturnStatement(pathValue) { returns.push(pathValue.get("argument")); } });
        else returns.push(body);
        const produced = returns.flatMap((item) => resolveCallbacks(item, new Set(seen))); if (produced.length) return produced;
      }
    }
    const resolved = resolveCallback(candidatePath, seen); return resolved ? [resolved] : [];
  };
  const markCallbackParameters = (candidatePath, result) => {
    const callbacks = [...new Map(resolveCallbacks(candidatePath).map((item) => [item.node, item])).values()];
    for (const callback of callbacks) for (const parameter of callback.get("params")) {
      if (result) for (const binding of getPatternBindings(parameter)) rawResultBindings.add(binding);
      else getPatternBindings(parameter).forEach(addRawErrorBinding);
      objectPatternRawErrorBindings(parameter).forEach(addRawErrorBinding);
    }
  };
  const inspectPromiseCallbacks = (callPath) => {
    const callee = unwrapExpression(callPath.get("callee"));
    if (!callee?.isMemberExpression?.() && !callee?.isOptionalMemberExpression?.()) return;
    const property = getPropertyName(callee);
    if (property === "catch") markCallbackParameters(callPath.get("arguments")[0], false);
    if (["addEventListener", "addListener", "on", "once"].includes(property) && getStaticString(callPath.get("arguments")[0]) === "error") markCallbackParameters(callPath.get("arguments")[1], false);
    if (property === "then") {
      markCallbackParameters(callPath.get("arguments")[0], true);
      markCallbackParameters(callPath.get("arguments")[1], false);
    }
  };
  traverse(ast, {
    CatchClause(catchPath) {
      const parameter = catchPath.get("param");
      for (const binding of getPatternBindings(parameter)) addRawErrorBinding(binding);
    },
    FunctionDeclaration(functionPath) { functionDeclarations.push(functionPath); },
    ClassDeclaration(classPath) { classDeclarations.push(classPath); },
    AssignmentPattern(patternPath) { assignmentPatterns.push(patternPath); },
    CallExpression(callPath) { promiseCalls.push(callPath); },
    OptionalCallExpression(callPath) { promiseCalls.push(callPath); },
    ImportSpecifier(importPath) {
      const imported = importPath.get("imported");
      const importedName = imported.isIdentifier() ? imported.node.name : imported.isStringLiteral() ? imported.node.value : "";
      const sourcePath = importPath.parentPath?.get("source");
      if (importedName === "getUserFacingErrorMessage" && sourcePath?.isStringLiteral?.() && moduleResolvesTo(sourcePath.node.value, sourceFile, "_lib/userFacingErrors")) {
        const binding = getBinding(importPath.get("local"));
        if (binding) sanitizerBindings.add(binding);
      }
    },
    VariableDeclarator(declaratorPath) { declarators.push(declaratorPath); },
    AssignmentExpression(assignmentPath) { assignments.push(assignmentPath); },
  });
  promiseCalls.forEach(inspectPromiseCallbacks);
  let changed = true;
  while (changed) {
    changed = false;
    for (const patternPath of assignmentPatterns) {
      if (!expressionContainsRawMessage(patternPath.get("right"), rawMessageBindings, rawErrorBindings, sanitizerBindings)) continue;
      for (const binding of getPatternBindings(patternPath.get("left"))) if (!rawMessageBindings.has(binding)) {
        rawMessageBindings.add(binding); changed = true;
      }
    }
    for (const functionPath of functionDeclarations) {
      const binding = getBinding(functionPath.get("id"));
      if (
        binding
        && functionReturnsRawMessage(functionPath, rawMessageBindings, rawErrorBindings, sanitizerBindings)
        && !rawMessageBindings.has(binding)
      ) {
        rawMessageBindings.add(binding);
        changed = true;
      }
    }
    for (const classPath of classDeclarations) {
      const binding = getBinding(classPath.get("id"));
      if (binding && expressionContainsRawMessage(classPath, rawMessageBindings, rawErrorBindings, sanitizerBindings) && !rawMessageBindings.has(binding)) {
        rawMessageBindings.add(binding); changed = true;
      }
    }
    for (const declaratorPath of declarators) {
      const id = declaratorPath.get("id");
      const init = declaratorPath.get("init");
      if (!init?.node) continue;
      const idBindings = getPatternBindings(id);
      if (id.isIdentifier() && init.isFunction?.()) {
        const functionBinding = getBinding(id);
        if (
          functionBinding?.constant
          && functionBinding.constantViolations.length === 0
          && functionReturnsOnlySanitizerDerivedMessages(init, sanitizerBindings)
          && !sanitizerBindings.has(functionBinding)
        ) {
          sanitizerBindings.add(functionBinding);
          changed = true;
        }
        if (
          functionBinding
          && functionReturnsRawMessage(
            init,
            rawMessageBindings,
            rawErrorBindings,
            sanitizerBindings,
          )
          && !rawMessageBindings.has(functionBinding)
        ) {
          rawMessageBindings.add(functionBinding);
          changed = true;
        }
      }
      if (id.isIdentifier() && isUntrustedResultExpression(init)) {
        const resultBinding = getBinding(id);
        if (resultBinding && !rawResultBindings.has(resultBinding)) {
          rawResultBindings.add(resultBinding);
          changed = true;
        }
      }
      if (id.isObjectPattern() && isUntrustedResultExpression(init)) {
        for (const binding of objectPatternRawErrorBindings(id)) {
          if (!rawErrorBindings.has(binding)) {
            rawErrorBindings.add(binding);
            changed = true;
          }
        }
      }
      if (idBindings.every((binding) => binding.constant && binding.constantViolations.length === 0)
        && isUserFacingSanitizerExpression(init, sanitizerBindings)) {
        for (const binding of idBindings) {
          if (!sanitizerBindings.has(binding)) {
            sanitizerBindings.add(binding);
            changed = true;
          }
        }
      }
      if (!id.isObjectPattern() && isRawErrorObjectExpression(init, rawErrorBindings, false)) {
        for (const binding of idBindings) {
          if (!rawErrorBindings.has(binding)) {
            rawErrorBindings.add(binding);
            changed = true;
          }
        }
      }
      const nextMessageBindings = id.isObjectPattern() || id.isArrayPattern?.()
        ? expressionContainsRawMessage(init, rawMessageBindings, rawErrorBindings, sanitizerBindings)
          ? idBindings : objectPatternMessageBindings(id, isRawErrorObjectExpression(init, rawErrorBindings))
        : !init.isFunction?.() && expressionContainsRawMessage(init, rawMessageBindings, rawErrorBindings, sanitizerBindings)
          ? idBindings
          : [];
      for (const binding of nextMessageBindings) {
        if (!rawMessageBindings.has(binding)) {
          rawMessageBindings.add(binding);
          changed = true;
        }
      }
      if (isDirectPresentationExpression(init, presentationBindings)) {
        for (const binding of idBindings) {
          if (!presentationBindings.has(binding)) {
            presentationBindings.add(binding);
            changed = true;
          }
        }
      }
    }
    for (const assignmentPath of assignments) {
      const leftBindings = getPatternBindings(assignmentPath.get("left"));
      const right = assignmentPath.get("right");
      let leftRoot = unwrapExpression(assignmentPath.get("left"));
      while (leftRoot?.isMemberExpression?.() || leftRoot?.isOptionalMemberExpression?.()) leftRoot = unwrapExpression(leftRoot.get("object"));
      let targetBinding = getBinding(leftRoot);
      if (leftRoot?.isThisExpression?.()) {
        const classPath = leftRoot.findParent((candidate) => candidate.isClass?.());
        targetBinding = getBinding(classPath?.get("id"));
      }
      if (targetBinding && right.isFunction?.()
        && functionReturnsRawMessage(right, rawMessageBindings, rawErrorBindings, sanitizerBindings)) {
        if (!rawMessageBindings.has(targetBinding)) { rawMessageBindings.add(targetBinding); changed = true; }
      }
      if (targetBinding && !right.isFunction?.()
        && expressionContainsRawMessage(right, rawMessageBindings, rawErrorBindings, sanitizerBindings)
        && !rawMessageBindings.has(targetBinding)) {
        rawMessageBindings.add(targetBinding); changed = true;
      }
      if (assignmentPath.get("left").isIdentifier() && right.isFunction?.()) {
        const binding = getBinding(assignmentPath.get("left"));
        if (
          binding
          && functionReturnsRawMessage(right, rawMessageBindings, rawErrorBindings, sanitizerBindings)
          && !rawMessageBindings.has(binding)
        ) {
          rawMessageBindings.add(binding);
          changed = true;
        }
      }
      if (assignmentPath.get("left").isIdentifier() && isUntrustedResultExpression(right)) {
        const resultBinding = getBinding(assignmentPath.get("left"));
        if (resultBinding && !rawResultBindings.has(resultBinding)) {
          rawResultBindings.add(resultBinding);
          changed = true;
        }
      }
      if (assignmentPath.get("left").isObjectPattern() && isUntrustedResultExpression(right)) {
        for (const binding of objectPatternRawErrorBindings(assignmentPath.get("left"))) {
          if (!rawErrorBindings.has(binding)) {
            rawErrorBindings.add(binding);
            changed = true;
          }
        }
      }
      const rightIsRawErrorObject = isRawErrorObjectExpression(right, rawErrorBindings, false);
      if (!assignmentPath.get("left").isObjectPattern() && rightIsRawErrorObject) {
        for (const binding of leftBindings) {
          if (!rawErrorBindings.has(binding)) {
            rawErrorBindings.add(binding);
            changed = true;
          }
        }
      }
      const nextMessageBindings = assignmentPath.get("left").isObjectPattern() && rightIsRawErrorObject
        ? objectPatternMessageBindings(assignmentPath.get("left"), true)
        : assignmentPath.get("left").isObjectPattern() || assignmentPath.get("left").isArrayPattern?.()
          ? expressionContainsRawMessage(right, rawMessageBindings, rawErrorBindings, sanitizerBindings)
            ? leftBindings : objectPatternMessageBindings(assignmentPath.get("left"), false)
        : !right.isFunction?.() && expressionContainsRawMessage(right, rawMessageBindings, rawErrorBindings, sanitizerBindings)
          ? leftBindings
          : [];
      for (const binding of nextMessageBindings) {
          if (!rawMessageBindings.has(binding)) {
            rawMessageBindings.add(binding);
            changed = true;
          }
      }
      if (isDirectPresentationExpression(right, presentationBindings)) {
        for (const binding of [...leftBindings, targetBinding].filter(Boolean)) {
          if (!presentationBindings.has(binding)) {
            presentationBindings.add(binding);
            changed = true;
          }
        }
      }
    }
  }
  const violations = [];
  const inspectPresentationCall = (callPath) => {
    const callee = unwrapExpression(callPath.get("callee"));
    const reflected = (callee?.isMemberExpression?.() || callee?.isOptionalMemberExpression?.())
      && getPropertyName(callee) === "apply" && callee.get("object").isIdentifier({ name: "Reflect" });
    const reflectedTargetIsPresentation = reflected && isDirectPresentationExpression(callPath.get("arguments")[0], presentationBindings);
    const argumentsToInspect = reflectedTargetIsPresentation ? callPath.get("arguments")[2]?.get?.("elements") ?? [] : callPath.get("arguments");
    if (reflected && !reflectedTargetIsPresentation) return;
    const presentationPassed = argumentsToInspect.some((argument) => isDirectPresentationExpression(argument, presentationBindings));
    if (!reflected && !isDirectPresentationExpression(callee, presentationBindings) && !presentationPassed) return;
    if ([callee, ...argumentsToInspect].some((argument) => expressionContainsRawMessage(
      argument,
      rawMessageBindings,
      rawErrorBindings,
      sanitizerBindings,
    ))) {
      violations.push(`${file}:${callPath.node.loc?.start.line ?? "?"}: raw error message reaches a customer presentation call`);
    }
  };
  traverse(ast, {
    CallExpression: inspectPresentationCall,
    OptionalCallExpression: inspectPresentationCall,
    JSXExpressionContainer(expressionContainerPath) {
      if (expressionContainsRawMessage(
        expressionContainerPath.get("expression"),
        rawMessageBindings,
        rawErrorBindings,
        sanitizerBindings,
      )) {
        violations.push(`${file}:${expressionContainerPath.node.loc?.start.line ?? "?"}: raw error message reaches customer JSX`);
      }
    },
  });
  return [...new Set(violations)];
};
const isStaticCustomerCopy = (expressionPath) => {
  if (expressionPath?.isStringLiteral?.() || expressionPath?.isNullLiteral?.()) return true;
  if (!expressionPath?.isIdentifier?.()) return false;
  const binding = getBinding(expressionPath);
  const declarator = binding?.path?.isVariableDeclarator?.() ? binding.path : binding?.path?.parentPath;
  return !!binding?.constant && declarator?.isVariableDeclarator?.()
    && declarator.get("init").isStringLiteral();
};
const collectUserFacingErrorConstructionViolations = (source, file, sourceFile) => {
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
  const approvedValidatorBindings = new Set();
  const approvedMessageBindings = new Set();
  const trustedErrorBindings = new Set();
  const invokedMembers = new Map();
  const violations = [];
  traverse(ast, {
    Program(programPath) {
      const binding = programPath.scope.getBinding("getSocialAttachmentValidationMessage");
      const declaratorPath = binding?.path?.isVariableDeclarator?.() ? binding.path : binding?.path?.parentPath?.isVariableDeclarator?.() ? binding.path.parentPath : null;
      const returns = [];
      declaratorPath?.get("init")?.traverse?.({ Function(innerPath) { innerPath.skip(); }, ReturnStatement(returnPath) { returns.push(returnPath.get("argument")); } });
      if (binding?.constant && binding.constantViolations.length === 0 && declaratorPath?.get("init")?.isFunction?.()
        && declaratorPath.parentPath?.parentPath?.isExportNamedDeclaration?.() && returns.length > 0 && returns.every(isStaticCustomerCopy)) approvedValidatorBindings.add(binding);
    },
    ImportSpecifier(importPath) {
      const imported = importPath.get("imported");
      const importedName = imported.isIdentifier() ? imported.node.name : imported.isStringLiteral() ? imported.node.value : "";
      const sourcePath = importPath.parentPath?.get("source");
      const source = sourcePath?.isStringLiteral?.() ? sourcePath.node.value : "";
      const localBinding = getBinding(importPath.get("local"));
      if (importedName === "getSocialAttachmentValidationMessage" && moduleResolvesTo(source, sourceFile, "_lib/socialAttachments") && localBinding) approvedValidatorBindings.add(localBinding);
      if (importedName === "UserFacingError" && moduleResolvesTo(source, sourceFile, "_lib/userFacingErrors") && localBinding) trustedErrorBindings.add(localBinding);
    },
    "CallExpression|OptionalCallExpression|NewExpression"(expressionPath) {
      const callee = unwrapExpression(expressionPath.get("callee"));
      if (!callee?.isMemberExpression?.() && !callee?.isOptionalMemberExpression?.()) return;
      const binding = getBinding(unwrapExpression(callee.get("object"))); const property = getPropertyName(callee);
      if (binding && property) invokedMembers.set(binding, (invokedMembers.get(binding) ?? new Set()).add(property));
    },
  });
  traverse(ast, {
    VariableDeclarator(declaratorPath) {
      const id = declaratorPath.get("id");
      const init = declaratorPath.get("init");
      if (
        !id.isIdentifier()
        || !init?.isCallExpression?.()
      ) return;
      const validatorBinding = getBinding(init.get("callee"));
      if (!validatorBinding || !approvedValidatorBindings.has(validatorBinding)) return;
      const binding = getBinding(id);
      if (binding?.constant && binding.constantViolations.length === 0) {
        approvedMessageBindings.add(binding);
      }
    },
  });
  const isApprovedMessage = (messagePath) => {
    if (!messagePath?.node) return false;
    if (isStaticCustomerCopy(messagePath)) return true;
    if (messagePath.isTemplateLiteral()) return messagePath.get("expressions").length === 0;
    if (messagePath.isIdentifier()) {
      const binding = getBinding(messagePath);
      return !!binding && approvedMessageBindings.has(binding);
    }
    return false;
  };
  const expressionUsesImport = (expressionPath, seen = new Set(), followLocalFunctions = true, anyImport = false) => {
    expressionPath = unwrapExpression(expressionPath);
    if (!expressionPath?.node) return false;
    const isErrorImport = (binding) => {
      if (binding?.kind !== "module") return false;
      if (anyImport) return true;
      const sourcePath = binding.path.findParent((candidate) => candidate.isImportDeclaration?.())?.get("source");
      return /^(?:UserFacing|Trusted|Customer).*Error|buildError$/i.test(binding.identifier?.name ?? "")
        || (sourcePath?.isStringLiteral?.() && /(?:userFacing|trusted)Errors?/i.test(sourcePath.node.value));
    };
    const directlyUsesImport = (candidatePath) => {
      candidatePath = unwrapExpression(candidatePath);
      if (candidatePath?.isIdentifier?.() && isErrorImport(getBinding(candidatePath))) return true;
      let found = false;
      candidatePath?.traverse?.({ Identifier(identifierPath) { if (identifierPath.isReferencedIdentifier() && isErrorImport(getBinding(identifierPath))) found = true; } });
      return found;
    };
    const bindingUsesImport = (binding) => {
      if (!binding || seen.has(binding)) return false;
      if (binding.kind === "module") return isErrorImport(binding);
      seen.add(binding);
      let owner = binding.path;
      if (owner?.isIdentifier?.()) owner = owner.parentPath;
      if (!owner?.isVariableDeclarator?.() && !owner?.isFunctionDeclaration?.() && !owner?.isClassDeclaration?.()) {
        owner = binding.path.findParent?.((candidate) => candidate.isVariableDeclarator?.());
      }
      if (owner?.isVariableDeclarator?.()) return expressionUsesImport(owner.get("init"), seen, followLocalFunctions, anyImport);
      if (owner?.isFunctionDeclaration?.() || owner?.isClassDeclaration?.()) return followLocalFunctions && expressionUsesImport(owner, seen, true, anyImport);
      return binding.constantViolations?.some((violation) => violation.isAssignmentExpression?.()
        && expressionUsesImport(violation.get("right"), seen, followLocalFunctions, anyImport)) ?? false;
    };
    if (expressionPath.isIdentifier()) return bindingUsesImport(getBinding(expressionPath));
    if (expressionPath.isAwaitExpression?.()) return expressionUsesImport(expressionPath.get("argument"), seen, followLocalFunctions, anyImport);
    if (expressionPath.isCallExpression?.() || expressionPath.isOptionalCallExpression?.() || expressionPath.isNewExpression?.()) {
      const callee = unwrapExpression(expressionPath.get("callee"));
      if (callee?.isImport?.() && (anyImport || /error/i.test(getStaticString(expressionPath.get("arguments")[0]) ?? ""))) return true;
      return expressionUsesImport(callee, seen, followLocalFunctions, anyImport)
        || expressionPath.get("arguments").some(directlyUsesImport);
    }
    if (expressionPath.isMemberExpression?.() || expressionPath.isOptionalMemberExpression?.()) {
      return expressionUsesImport(expressionPath.get("object"), seen, followLocalFunctions, anyImport);
    }
    let found = false;
    expressionPath.traverse({ Identifier(identifierPath) { if (identifierPath.isReferencedIdentifier() && bindingUsesImport(getBinding(identifierPath))) found = true; } });
    return found;
  };
  const isImportedFactoryReference = (expressionPath, seen = new Set()) => {
    expressionPath = unwrapExpression(expressionPath);
    if (!expressionPath?.node) return false;
    if (expressionPath.isAwaitExpression?.()) return isImportedFactoryReference(expressionPath.get("argument"), seen);
    if (expressionPath.isSequenceExpression?.()) return expressionPath.get("expressions").some((item) => isImportedFactoryReference(item, seen));
    if (expressionPath.isLogicalExpression?.() || expressionPath.isBinaryExpression?.()) return isImportedFactoryReference(expressionPath.get("left"), seen)
      || isImportedFactoryReference(expressionPath.get("right"), seen);
    if (expressionPath.isConditionalExpression?.()) return isImportedFactoryReference(expressionPath.get("consequent"), seen)
      || isImportedFactoryReference(expressionPath.get("alternate"), seen);
    if (expressionPath.isArrayExpression?.()) return expressionPath.get("elements").some((item) => isImportedFactoryReference(item, seen));
    if (expressionPath.isObjectExpression?.()) return expressionPath.get("properties").some((item) => isImportedFactoryReference(item.isObjectProperty?.() ? item.get("value") : item, seen));
    if (expressionPath.isSpreadElement?.()) return isImportedFactoryReference(expressionPath.get("argument"), seen);
    if (expressionPath.isFunction?.() || expressionPath.isClass?.()) return expressionUsesImport(expressionPath, new Set(seen), true, true);
    if (expressionPath.isCallExpression?.() || expressionPath.isOptionalCallExpression?.() || expressionPath.isNewExpression?.()) {
      const callee = unwrapExpression(expressionPath.get("callee"));
      return callee?.isImport?.() || isImportedFactoryReference(callee, seen)
        || expressionPath.get("arguments").some((item) => isImportedFactoryReference(item, seen))
        || (getPropertyName(callee) === "resolve" && unwrapExpression(callee.get("object"))?.isIdentifier?.({ name: "Promise" })
          && expressionPath.get("arguments").some((item) => isImportedFactoryReference(item, seen)));
    }
    if (expressionPath.isMemberExpression?.() || expressionPath.isOptionalMemberExpression?.()) {
      const object = unwrapExpression(expressionPath.get("object"));
      if (!object?.isIdentifier?.()) return isImportedFactoryReference(object, seen);
      const binding = getBinding(object);
      if (binding?.kind === "module") return true;
      const declaration = binding?.path?.isClassDeclaration?.() || binding?.path?.isFunctionDeclaration?.() ? binding.path : null;
      if (declaration) return isImportedFactoryReference(declaration, seen);
      const owner = binding?.path?.isVariableDeclarator?.() ? binding.path : binding?.path?.findParent?.((candidate) => candidate.isVariableDeclarator?.());
      const init = owner?.isVariableDeclarator?.() ? unwrapExpression(owner.get("init")) : null;
      const awaited = init?.isAwaitExpression?.() ? unwrapExpression(init.get("argument")) : null;
      return !!init?.node && !init.isCallExpression?.() && !init.isOptionalCallExpression?.()
        && (!awaited?.node || (awaited.isCallExpression?.() && awaited.get("callee").isImport?.()))
        && isImportedFactoryReference(object, seen);
    }
    if (!expressionPath.isIdentifier?.()) return false;
    const binding = getBinding(expressionPath);
    if (!binding || seen.has(binding)) return false;
    if (binding.kind === "module") return true;
    seen.add(binding);
    const owner = binding.path.isVariableDeclarator?.() || binding.path.isFunctionDeclaration?.() || binding.path.isClassDeclaration?.()
      ? binding.path : binding.path.findParent?.((candidate) => candidate.isVariableDeclarator?.() || candidate.isFunctionDeclaration?.() || candidate.isClassDeclaration?.());
    if (owner?.isFunctionDeclaration?.() || owner?.isClassDeclaration?.()) return isImportedFactoryReference(owner, seen);
    if (!owner?.isVariableDeclarator?.()) return false;
    const init = unwrapExpression(owner.get("init"));
    if (owner.get("id").isObjectPattern?.()) {
      const awaited = init?.isAwaitExpression?.() ? unwrapExpression(init.get("argument")) : null;
      return !!awaited?.isCallExpression?.() && awaited.get("callee").isImport?.();
    }
    return isImportedFactoryReference(init, seen) || binding.constantViolations.some((item) => item.isAssignmentExpression?.()
        && isImportedFactoryReference(item.get("right"), seen));
  };
  const isDirectImportedFactoryReference = (expressionPath, seen = new Set()) => {
    expressionPath = unwrapExpression(expressionPath);
    if (!expressionPath?.node) return false;
    if (expressionPath.isAwaitExpression?.()) return isDirectImportedFactoryReference(expressionPath.get("argument"), seen);
    if (expressionPath.isMemberExpression?.() || expressionPath.isOptionalMemberExpression?.()) return isDirectImportedFactoryReference(expressionPath.get("object"), seen);
    if (!expressionPath.isIdentifier?.()) return false;
    const binding = getBinding(expressionPath);
    if (!binding || seen.has(binding)) return false;
    if (binding.kind === "module") return true;
    seen.add(binding);
    const owner = binding.path.isVariableDeclarator?.() ? binding.path : binding.path.findParent?.((candidate) => candidate.isVariableDeclarator?.());
    const init = owner?.isVariableDeclarator?.() ? unwrapExpression(owner.get("init")) : null;
    return !!init?.node && (init.isIdentifier?.() || init.isMemberExpression?.() || init.isOptionalMemberExpression?.() || init.isAwaitExpression?.())
      && isDirectImportedFactoryReference(init, seen);
  };
  const isImportedConstruction = (expressionPath, seen = new Set()) => {
    expressionPath = unwrapExpression(expressionPath);
    if (!expressionPath?.node) return false;
    if (expressionPath.isAwaitExpression?.()) return isImportedConstruction(expressionPath.get("argument"), seen);
    if (expressionPath.isLogicalExpression?.() || expressionPath.isConditionalExpression?.()) {
      return expressionPath.get("left")?.node
        ? isImportedConstruction(expressionPath.get("left"), seen) || isImportedConstruction(expressionPath.get("right"), seen)
        : isImportedConstruction(expressionPath.get("consequent"), seen) || isImportedConstruction(expressionPath.get("alternate"), seen);
    }
    if (expressionPath.isCallExpression?.() || expressionPath.isOptionalCallExpression?.() || expressionPath.isNewExpression?.()) {
      return isImportedFactoryReference(expressionPath.get("callee"))
        || expressionPath.get("arguments").some((argument) => isImportedFactoryReference(argument));
    }
    if (!expressionPath.isIdentifier?.()) return false;
    const binding = getBinding(expressionPath);
    if (!binding || seen.has(binding)) return false;
    seen.add(binding);
    let owner = binding.path.isVariableDeclarator?.() ? binding.path : binding.path.findParent?.((candidate) => candidate.isVariableDeclarator?.());
    if (owner?.get("id")?.isObjectPattern?.()) return false;
    return owner?.isVariableDeclarator?.() ? isImportedConstruction(owner.get("init"), seen) : false;
  };
  traverse(ast, {
    ImportSpecifier(importPath) {
      const imported = importPath.get("imported");
      const importedName = imported.isIdentifier() ? imported.node.name : imported.isStringLiteral() ? imported.node.value : "";
      if (importedName !== "UserFacingError") return;
      const local = importPath.get("local");
      const binding = getBinding(local);
      if (!local.isIdentifier({ name: "UserFacingError" }) || !binding || !trustedErrorBindings.has(binding)) {
        violations.push(`${file}:${importPath.node.loc?.start.line ?? "?"}: UserFacingError must use the named app-owned import`);
      }
    },
    CallExpression(callPath) {
      const callee = unwrapExpression(callPath.get("callee"));
      const object = callee?.isMemberExpression?.() || callee?.isOptionalMemberExpression?.() ? unwrapExpression(callee.get("object")) : null;
      const property = getPropertyName(callee); const args = callPath.get("arguments"); const targetBinding = getBinding(unwrapExpression(args[0])); const invoked = invokedMembers.get(targetBinding);
      if (callee?.isIdentifier?.({ name: "require" }) || getPropertyName(callee) === "require"
        || (["call", "apply"].includes(getPropertyName(callee)) && object?.isIdentifier?.({ name: "require" }))) {
        violations.push(`${file}:${callPath.node.loc?.start.line ?? "?"}: CommonJS imports are not an app-owned customer-copy boundary`);
      }
      if (property === "assign" && object?.isIdentifier?.({ name: "Object" })
        && args.slice(1).some((argument) => expressionUsesImport(argument, new Set(), true, true))) {
        violations.push(`${file}:${callPath.node.loc?.start.line ?? "?"}: imported error values must not be laundered through containers`);
      }
      if (property === "set" && object?.isIdentifier?.({ name: "Reflect" }) && invoked?.has(getStaticString(args[1]))
        && expressionUsesImport(args[2], new Set(), true, true)) violations.push(`${file}:${callPath.node.loc?.start.line ?? "?"}: imported error values must not be installed through reflection`);
      if (property === "defineProperty" && ["Object", "Reflect"].some((name) => object?.isIdentifier?.({ name })) && invoked?.has(getStaticString(args[1])) && expressionUsesImport(args[2], new Set(), true, true)) violations.push(`${file}:${callPath.node.loc?.start.line ?? "?"}: imported error values must not be installed through property descriptors`);
      if (property === "defineProperties" && object?.isIdentifier?.({ name: "Object" }) && invoked?.size && expressionUsesImport(args[1], new Set(), true, true)) violations.push(`${file}:${callPath.node.loc?.start.line ?? "?"}: imported error values must not be installed through property descriptors`);
    },
    AssignmentExpression(assignmentPath) {
      const left = unwrapExpression(assignmentPath.get("left"));
      const invokedMember = (left?.isMemberExpression?.() || left?.isOptionalMemberExpression?.())
        && invokedMembers.get(getBinding(unwrapExpression(left.get("object"))))?.has(getPropertyName(left));
      if (expressionUsesImport(assignmentPath.get("right")) || (invokedMember && expressionUsesImport(assignmentPath.get("right"), new Set(), true, true))) violations.push(`${file}:${assignmentPath.node.loc?.start.line ?? "?"}: imported error constructors must not be assigned`);
    },
    ReturnStatement(returnPath) {
      if (expressionUsesImport(returnPath.get("argument"), new Set(), false)) violations.push(`${file}:${returnPath.node.loc?.start.line ?? "?"}: imported error values must not be returned`);
      const argument = unwrapExpression(returnPath.get("argument"));
      if ((argument?.isCallExpression?.() || argument?.isNewExpression?.())
        && isDirectImportedFactoryReference(argument.get("callee"))
        && argument.get("arguments").some((item) => !isStaticCustomerCopy(item))) {
        violations.push(`${file}:${returnPath.node.loc?.start.line ?? "?"}: imported factories must not return dynamic customer copy`);
      }
    },
    ThrowStatement(throwPath) {
      const argument = throwPath.get("argument");
      const unwrappedArgument = unwrapExpression(argument);
      const callee = unwrappedArgument?.isNewExpression?.() ? unwrapExpression(unwrappedArgument.get("callee")) : null;
      const directTrusted = callee?.isIdentifier?.({ name: "UserFacingError" }) && trustedErrorBindings.has(getBinding(callee));
      if (!directTrusted && (expressionUsesImport(argument) || isImportedConstruction(argument))) {
        violations.push(`${file}:${throwPath.node.loc?.start.line ?? "?"}: imported error values are not an app-owned customer-copy boundary`);
      }
    },
    Identifier(identifierPath) {
      if (identifierPath.node.name === "require" && identifierPath.isReferencedIdentifier()) {
        violations.push(`${file}:${identifierPath.node.loc?.start.line ?? "?"}: CommonJS imports are not an app-owned customer-copy boundary`);
        return;
      }
      if (identifierPath.node.name !== "UserFacingError") return;
      if (identifierPath.parentPath?.isImportSpecifier?.()) return;
      if (identifierPath.parentPath?.isBinaryExpression?.({ operator: "instanceof" }) && identifierPath.key === "right") return;
      if (
        identifierPath.parentPath?.isNewExpression?.()
        && identifierPath.key === "callee"
      ) return;
      violations.push(`${file}:${identifierPath.node.loc?.start.line ?? "?"}: UserFacingError must be constructed directly without aliasing or wrapping`);
    },
    MemberExpression(memberPath) {
      if (getPropertyName(memberPath) === "UserFacingError") {
        violations.push(`${file}:${memberPath.node.loc?.start.line ?? "?"}: UserFacingError must not be reached through a member alias`);
      }
    },
    OptionalMemberExpression(memberPath) {
      if (getPropertyName(memberPath) === "UserFacingError") {
        violations.push(`${file}:${memberPath.node.loc?.start.line ?? "?"}: UserFacingError must not be reached through a member alias`);
      }
    },
    NewExpression(newExpressionPath) {
      if (!newExpressionPath.get("callee").isIdentifier({ name: "UserFacingError" })) return;
      const constructorBinding = getBinding(newExpressionPath.get("callee"));
      if (!constructorBinding || !trustedErrorBindings.has(constructorBinding)) {
        violations.push(`${file}:${newExpressionPath.node.loc?.start.line ?? "?"}: UserFacingError must use the app-owned constructor binding`);
        return;
      }
      const messageArgument = newExpressionPath.get("arguments")[1];
      if (!isApprovedMessage(messageArgument)) {
        violations.push(`${file}:${newExpressionPath.node.loc?.start.line ?? "?"}: UserFacingError copy must be static or produced by the approved attachment validator`);
      }
    },
  });
  return [...new Set(violations)];
};
const collectDomainErrorPolicyViolations = (source, file, sourceFile) => [
  ...collectCustomerErrorBoundaryViolations(source, file, sourceFile),
  ...collectUserFacingErrorConstructionViolations(source, file, sourceFile),
];
const collectDomainFailureWrapperViolations = (source, file, functionName, fallback, requiredCopy = null) => {
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
  const violations = [];
  let exportedMatches = 0;
  traverse(ast, {
    FunctionDeclaration(functionPath) {
      if (!functionPath.get("id").isIdentifier({ name: functionName })) return;
      if (!functionPath.parentPath?.isExportNamedDeclaration?.() || !functionPath.parentPath.parentPath?.isProgram?.()) return;
      exportedMatches += 1;
      const functionStatements = functionPath.get("body.body");
      const outerTry = functionStatements.length === 1 && functionStatements[0].isTryStatement?.() ? functionStatements[0] : null;
      const handler = outerTry?.get("handler");
      const catchBinding = getPatternBindings(handler?.get("param"))[0];
      if (!handler?.node || !catchBinding) {
        violations.push(`${file}: ${functionName} must have an outer typed failure wrapper`);
        return;
      }
      const statements = handler.get("body.body");
      const isCatchIdentifier = (pathValue) => pathValue?.isIdentifier?.() && getBinding(pathValue) === catchBinding;
      const isTypedThrow = (pathValue, copy) => {
        if (!pathValue?.isThrowStatement?.()) return false;
        const value = unwrapExpression(pathValue.get("argument"));
        return value?.isNewExpression?.() && unwrapExpression(value.get("callee"))?.isIdentifier?.({ name: "UserFacingError" })
          && getStaticString(value.get("arguments")[1]) === copy;
      };
      const safeIf = statements[0];
      const safeTest = safeIf?.get("test");
      const safeRethrow = safeIf?.get("consequent");
      const safeExact = safeIf?.isIfStatement?.() && !safeIf.get("alternate")?.node
        && safeTest?.isBinaryExpression?.({ operator: "instanceof" })
        && isCatchIdentifier(unwrapExpression(safeTest.get("left")))
        && unwrapExpression(safeTest.get("right"))?.isIdentifier?.({ name: "UserFacingError" })
        && safeRethrow?.isThrowStatement?.() && isCatchIdentifier(unwrapExpression(safeRethrow.get("argument")));
      const throws = [];
      handler.traverse({ Function(innerPath) { innerPath.skip(); }, ThrowStatement(throwPath) { throws.push(throwPath); } });
      if (statements.length !== (requiredCopy ? 3 : 2) || !safeExact || throws.some((throwPath) => isCatchIdentifier(unwrapExpression(throwPath.get("argument"))) && throwPath.node !== safeRethrow?.node)) {
        violations.push(`${file}: ${functionName} must rethrow only an exact app-owned UserFacingError`);
      }
      if (!isTypedThrow(statements.at(-1), fallback)) violations.push(`${file}: ${functionName} must end with its static generic failure copy`);
      if (requiredCopy) {
        const classifiedIf = statements[1];
        const test = classifiedIf?.isIfStatement?.() ? classifiedIf.get("test") : null;
        const typeCheck = test?.isLogicalExpression?.({ operator: "&&" }) ? test.get("left") : null;
        const copyCheck = test?.isLogicalExpression?.({ operator: "&&" }) ? test.get("right") : null;
        const exactClassification = classifiedIf?.isIfStatement?.() && !classifiedIf.get("alternate")?.node
          && test?.isLogicalExpression?.({ operator: "&&" })
          && typeCheck?.isBinaryExpression?.({ operator: "instanceof" })
          && isCatchIdentifier(unwrapExpression(typeCheck.get("left")))
          && unwrapExpression(typeCheck.get("right"))?.isIdentifier?.({ name: "Error" })
          && !getBinding(unwrapExpression(typeCheck.get("right")))
          && copyCheck?.isBinaryExpression?.({ operator: "===" })
          && getPropertyName(unwrapExpression(copyCheck.get("left"))) === "message"
          && isCatchIdentifier(unwrapExpression(unwrapExpression(copyCheck.get("left")).get("object")))
          && getStaticString(copyCheck.get("right")) === requiredCopy
          && isTypedThrow(classifiedIf.get("consequent"), requiredCopy);
        if (!exactClassification) violations.push(`${file}: ${functionName} must preserve the exact measured-size classification branch`);
        const uploadCalls = []; const uploadBinding = functionPath.scope.getBinding("uploadFileToMediaStorage"); let uploadAlias = false;
        functionPath.traverse({ Identifier(pathValue) { if (pathValue.isReferencedIdentifier?.() && getBinding(pathValue) === uploadBinding && !(pathValue.key === "callee" && (pathValue.parentPath?.isCallExpression?.() || pathValue.parentPath?.isOptionalCallExpression?.()))) uploadAlias = true; }, CallExpression(callPath) { const awaited = callPath.parentPath; const owner = awaited?.isAwaitExpression?.() ? awaited.parentPath : null; const conditional = callPath.findParent((item) => item.isIfStatement?.() || item.isConditionalExpression?.() || item.isLogicalExpression?.() || item.isLoop?.() || item.isSwitchCase?.()); if (!conditional && unwrapExpression(callPath.get("callee"))?.isIdentifier?.({ name: "uploadFileToMediaStorage" }) && owner?.isVariableDeclarator?.() && owner.get("id").isIdentifier?.({ name: "uploadedObject" })) uploadCalls.push(callPath); } });
        if (uploadAlias) violations.push(`${file}: ${functionName} must call the measured upload boundary directly`);
        const uploadConfig = uploadCalls.length === 1 ? unwrapExpression(uploadCalls[0].get("arguments")[0]) : null;
        const propertyValue = (name) => { const property = uploadConfig?.isObjectExpression?.() ? uploadConfig.get("properties").find((item) => { const key = item.get("key"); return item.isObjectProperty?.() && (item.node.computed ? getStaticString(key) : key.isIdentifier?.() ? key.node.name : getStaticString(key)) === name; }) : null; return unwrapExpression(property?.get("value")); };
        if (!propertyValue("maximumSizeBytes")?.isIdentifier?.({ name: "SOCIAL_ATTACHMENT_MAX_BYTES" })
          || !propertyValue("tooLargeMessage")?.isIdentifier?.({ name: "SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE" })) {
          violations.push(`${file}: ${functionName} must bind the measured-size limit and exact customer copy to the upload call`);
        }
      }
    },
  });
  if (exportedMatches !== 1) violations.push(`${file}: ${functionName} must be the single direct named export carrying the typed failure wrapper`);
  return violations;
};
const collectUserFacingErrorExportViolations = (source, file) => {
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript"] });
  const allowed = new Set(["UserFacingErrorCode", "UserFacingError", "getUserFacingErrorMessage"]);
  const violations = [];
  traverse(ast, {
    Identifier(path) { if (["module", "exports"].includes(path.node.name) && path.isReferencedIdentifier()) violations.push(`${file}:${path.node.loc?.start.line ?? "?"}: CommonJS customer-error exports are not allowed`); },
    ExportNamedDeclaration(exportPath) {
      if (exportPath.get("source")?.node) violations.push(`${file}:${exportPath.node.loc?.start.line ?? "?"}: customer-error re-exports are not allowed`);
      const declaration = exportPath.get("declaration");
      const names = declaration?.isVariableDeclaration?.()
        ? declaration.get("declarations").flatMap((item) => Object.keys(item.get("id").getBindingIdentifiers()))
        : declaration?.node
          ? Object.keys(declaration.get("id").getBindingIdentifiers())
        : exportPath.get("specifiers").flatMap((specifier) => { const local = specifier.get("local"); const exported = specifier.get("exported"); const localName = local.node.name ?? local.node.value; const exportedName = exported.node.name ?? exported.node.value; return localName === exportedName ? [localName] : [localName, exportedName]; });
      for (const name of names) if (!allowed.has(name)) violations.push(`${file}:${exportPath.node.loc?.start.line ?? "?"}: unapproved customer-error export ${name}`);
    },
    ExportDefaultDeclaration(exportPath) { violations.push(`${file}:${exportPath.node.loc?.start.line ?? "?"}: default customer-error exports are not allowed`); },
  });
  return violations;
};
const collectPlainThrownErrorViolations = (source, file) => {
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
  const violations = [];
  traverse(ast, {
    Identifier(path) { if (path.node.name === "Error") violations.push(`${file}:${path.node.loc?.start.line ?? "?"}: attachment picker guidance must not reference plain Error`); },
    StringLiteral(stringPath) {
      if (stringPath.node.value === "Error" && (stringPath.parentPath?.isMemberExpression?.() || stringPath.parentPath?.isOptionalMemberExpression?.())) violations.push(`${file}:${stringPath.node.loc?.start.line ?? "?"}: attachment picker guidance must not reference plain Error`);
    },
  });
  return [...new Set(violations)];
};
const loadUserFacingErrorModule = async (source, label) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: `_lib/userFacingErrors-${label}.ts`,
  }).outputText;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return import(dataUrl);
};
const getUserFacingBehaviorFailures = async (source, label) => {
  try {
    const module = await loadUserFacingErrorModule(source, label);
    const { getUserFacingErrorMessage, UserFacingError } = module;
    const fallback = "Action-specific safe fallback.";
    const cases = [
      [new Error("duplicate key value violates unique constraint private_table_key"), fallback],
      [new Error("authoritative transition failed"), fallback],
      [new Error("Cannot convert undefined or null to object"), fallback],
      [new Error("unrecognized provider detail"), fallback],
      [new Error("Invalid login credentials"), "The email or password is incorrect."],
      [new Error("Email not confirmed"), "Confirm your email, then try signing in again."],
      [new Error("Too many requests"), "Too many attempts. Wait a moment, then try again."],
      [new Error("Network request failed"), "Check your connection and try again."],
      [new Error("JWT expired"), "Sign in again, then try that action one more time."],
      [new Error("authorization denied"), "This account does not have permission to complete that action."],
      [new Error("Upload file size exceeded maximum"), "That file is too large for this upload."],
      [new Error("Unsupported MIME type for upload"), "That file type is not supported here."],
      [new UserFacingError("attachment_action", "Photo gallery needs the current app build."), "Photo gallery needs the current app build."],
      [new UserFacingError("circle_action", "You cannot request yourself."), "You cannot request yourself."],
    ];
    return cases.flatMap(([error, expected], index) => { const actual = getUserFacingErrorMessage(error, fallback); return actual === expected ? [] : [`case ${index + 1}: expected ${expected}, received ${actual}`]; });
  } catch (error) {
    return [`module evaluation failed: ${error instanceof Error ? error.message : String(error)}`];
  }
};
const filesToScanForEntities = [
  "app/(auth)/login.tsx", "app/(auth)/signup.tsx", "app/(tabs)/index.tsx", "app/admin.tsx",
  "app/channel/[userId].tsx", "app/channel-settings.tsx", "app/chat/[threadId].tsx", "app/chat/index.tsx",
  "app/chilly-circle.tsx", "app/copyright-report.tsx", "app/player/[id].tsx", "app/profile/[userId].tsx",
  "app/settings.tsx", "app/subscribe.tsx", "app/title/[id].tsx", "app/watch-party/live-stage/[partyId].tsx",
  "app/watch-party/[partyId].tsx", "components/ads/NativeAdSlot.tsx", "components/communication/in-room-communication-panel.tsx",
  "components/communication/communication-preview-card.tsx", "components/legal/legal-policy-viewer.tsx",
  "components/live/live-effects-sheet.tsx", "components/system/root-error-boundary.tsx",
  "components/system/runtime-unavailable-screen.tsx", "components/system/support-screen.tsx",
];
for (const file of filesToScanForEntities) {
  const source = read(file);
  assertNotIncludes(source, "&#39;", file);
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
  const seen = new WeakSet();
  const visit = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (node.type === "StringLiteral" && node.value.includes("&apos;")) {
      fail(`${file} must not preserve &apos; inside a JavaScript string expression`);
    }
    if (node.type === "TemplateElement" && (node.value.cooked ?? node.value.raw).includes("&apos;")) {
      fail(`${file} must not preserve &apos; inside a JavaScript template expression`);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(ast);
}
const userFacingErrors = read("_lib/userFacingErrors.ts");
assertIncludes(userFacingErrors, "getUserFacingErrorMessage", "shared user-facing error helper"); assertIncludes(userFacingErrors, "class UserFacingError", "trusted domain error type");
assertIncludes(userFacingErrors, "This account does not have permission", "permission-safe error copy"); assertIncludes(userFacingErrors, "Sign in again", "auth-safe error copy");
assertIncludes(userFacingErrors, "Check your connection", "network-safe error copy");
assertIncludes(userFacingErrors, "The email or password is incorrect.", "credential-safe error copy");
assertIncludes(userFacingErrors, "Confirm your email", "email-confirmation-safe error copy");
assertIncludes(userFacingErrors, "Too many attempts.", "rate-limit-safe error copy");
assertIncludes(userFacingErrors, "Unknown messages must fail closed", "unknown-error fail-closed policy");
for (const violation of collectUserFacingErrorExportViolations(userFacingErrors, "Shared user-facing errors")) fail(violation);
for (const behaviorFailure of await getUserFacingBehaviorFailures(userFacingErrors, "current")) fail(`shared user-facing error behavior ${behaviorFailure}`);
const mediaUploadSizeModule = await loadUserFacingErrorModule(read("_lib/mediaUploadSize.ts"), "media-upload-size");
try {
  await mediaUploadSizeModule.resolveMediaUploadSizeBytes({
    providedSizeBytes: undefined, readSizeBytes: async () => 250 * 1024 * 1024 + 1,
    maximumSizeBytes: 250 * 1024 * 1024, tooLargeMessage: "This attachment is too large for comments/chat right now.",
  });
  fail("measured attachment over-limit behavior must reject before upload");
} catch (error) {
  if (error?.message !== "This attachment is too large for comments/chat right now.") fail("measured attachment over-limit behavior lost its actionable copy");
}
const userFacingErrorMutations = [
  ["unknown errors pass through", (source) => source.replace(/return fallback;\n}\s*$/, "return rawMessage;\n}")],
  ["broad auth substring classification", (source) => source.replace('|| message.includes("authentication")', '|| message.includes("authentication")\n    || message.includes("auth")')],
  ["broad object substring classification", (source) => source.replace('|| message.includes("object storage")', '|| message.includes("object storage")\n    || message.includes("object")')],
];
for (const [label, mutate] of userFacingErrorMutations) {
  const mutated = mutate(userFacingErrors);
  if (mutated === userFacingErrors) {
    fail(`user-facing error mutation fixture did not apply: ${label}`);
    continue;
  }
  const mutationFailures = await getUserFacingBehaviorFailures(mutated, `mutation-${label.replace(/\W+/g, "-")}`);
  if (mutationFailures.length === 0) fail(`user-facing error behavior guard accepted mutation: ${label}`);
}
for (const [label, mutation] of [
  ["aliased constructor", `${userFacingErrors}\nexport { UserFacingError as TrustedError };\n`],
  ["factory", `${userFacingErrors}\nexport const buildError = (message) => new UserFacingError("chat_action", message);\n`],
  ["CommonJS factory", `${userFacingErrors}\nmodule.exports.TrustedError = UserFacingError; Object.defineProperty(exports, "buildError", { value: UserFacingError });\n`],
]) if (collectUserFacingErrorExportViolations(mutation, `Shared user-facing error ${label} mutation`).length === 0) {
  fail(`user-facing error export guard accepted an ${label} export`);
}
const login = read("app/(auth)/login.tsx");
const chatInbox = read("app/chat/index.tsx");
const chatThread = read("app/chat/[threadId].tsx");
const chatInviteSheet = read("components/chat/internal-invite-sheet.tsx");
const chillyCircle = read("app/chilly-circle.tsx");
const playerBoundary = read("app/player/[id].tsx");
const partyRoomBoundary = read("app/watch-party/[partyId].tsx");
const liveStageBoundary = read("app/watch-party/live-stage/[partyId].tsx");
for (const [label, source, sourceFile] of [
  ["Login", login, "app/(auth)/login.tsx"],
  ["Chi'lly Chat Inbox", chatInbox, "app/chat/index.tsx"],
  ["Chi'lly Chat Thread", chatThread, "app/chat/[threadId].tsx"],
  ["Chi'lly Chat Invite", chatInviteSheet, "components/chat/internal-invite-sheet.tsx"],
  ["Chi'lly Circle", chillyCircle, "app/chilly-circle.tsx"],
  ["Player", playerBoundary, "app/player/[id].tsx"],
  ["Party Room", partyRoomBoundary, "app/watch-party/[partyId].tsx"],
  ["Live Stage", liveStageBoundary, "app/watch-party/live-stage/[partyId].tsx"],
]) {
  assertIncludes(source, "getUserFacingErrorMessage", `${label} sanitized error boundary`);
  for (const violation of collectCustomerErrorBoundaryViolations(source, label, sourceFile)) fail(violation);
}
const chatDomain = read("_lib/chat.ts");
const friendGraph = read("_lib/friendGraph.ts");
const socialAttachments = read("_lib/socialAttachments.ts");
const socialAttachmentPicker = read("_lib/socialAttachmentPicker.ts");
for (const [label, source, code, sourceFile] of [
  ["Chi'lly Chat domain", chatDomain, "chat_action", "_lib/chat.ts"],
  ["Chi'lly Circle domain", friendGraph, "circle_action", "_lib/friendGraph.ts"],
  ["Social attachments domain", socialAttachments, "attachment_action", "_lib/socialAttachments.ts"],
  ["Social attachment picker", socialAttachmentPicker, "attachment_action", "_lib/socialAttachmentPicker.ts"],
]) {
  assertIncludes(source, "UserFacingError", `${label} trusted domain error type`);
  assertIncludes(source, `\"${code}\"`, `${label} trusted domain error code`);
  for (const violation of collectDomainErrorPolicyViolations(source, label, sourceFile)) fail(violation);
}
for (const violation of collectPlainThrownErrorViolations(socialAttachmentPicker, "Social attachment picker")) fail(violation);
for (const violation of collectDomainFailureWrapperViolations(socialAttachmentPicker, "Social attachment picker", "pickSocialAttachmentFile", "Unable to choose that attachment right now. Try again.")) fail(violation);
for (const violation of collectDomainFailureWrapperViolations(socialAttachments, "Social attachments domain", "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now.")) fail(violation);
for (const [label, mutation, functionName, fallback, requiredCopy] of [
  ["picker raw rethrow", socialAttachmentPicker.replace('throw new UserFacingError("attachment_action", "Unable to choose that attachment right now. Try again.");', "throw error;"), "pickSocialAttachmentFile", "Unable to choose that attachment right now. Try again.", null],
  ["upload raw rethrow", socialAttachments.replace('throw new UserFacingError("attachment_action", "Unable to upload that attachment right now. Try again.");', "throw error;"), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["late-size classification removal", socialAttachments.replace(/\n\s*if \(error instanceof Error && error\.message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE\).*\n/, "\n"), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["truthy safe rethrow", socialAttachments.replace("if (error instanceof UserFacingError) throw error;", "if (true || error instanceof UserFacingError) throw error;"), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["inverted safe rethrow", socialAttachments.replace("if (error instanceof UserFacingError) throw error;", "if (!(error instanceof UserFacingError)) {} else throw error;"), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["unreachable size classification", socialAttachments.replace("if (error instanceof Error && error.message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE)", "if (false && error instanceof Error && error.message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE)"), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["unrelated size classification", socialAttachments.replace("error.message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE", "other.message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE"), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["inverted size classification", socialAttachments.replace("error.message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE", "error.message !== SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE"), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["missing upload limit binding", socialAttachments.replace("        maximumSizeBytes: SOCIAL_ATTACHMENT_MAX_BYTES,\n", ""), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["wrong upload copy binding", socialAttachments.replace("        tooLargeMessage: SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE,", '        tooLargeMessage: "That file is too large.",'), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["disconnected upload decoy", socialAttachments.replace("const uploadedObject = await uploadFileToMediaStorage({", "const uploadAlias = uploadFileToMediaStorage;\n        const uploadedObject = await uploadAlias({").replace("          maximumSizeBytes: SOCIAL_ATTACHMENT_MAX_BYTES,\n", "").replace("          tooLargeMessage: SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE,\n", "").replace("    const preparedUpload = await (async () => {", "    if (false) { const uploadedObject = await uploadFileToMediaStorage({ maximumSizeBytes: SOCIAL_ATTACHMENT_MAX_BYTES, tooLargeMessage: SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE } as any); void uploadedObject; }\n    const preparedUpload = await (async () => {"), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["nested decoy wrapper", `${socialAttachmentPicker.replace("export async function pickSocialAttachmentFile(scope: SocialAttachmentPickerScope) {", "export const pickSocialAttachmentFile = async (scope: SocialAttachmentPickerScope) => {").replace(/\n}\s*$/, "\n};")}\nfunction __decoy() { function pickSocialAttachmentFile() { try {} catch (error) { if (error instanceof UserFacingError) throw error; throw new UserFacingError(\"attachment_action\", \"Unable to choose that attachment right now. Try again.\"); } } }`, "pickSocialAttachmentFile", "Unable to choose that attachment right now. Try again.", null],
  ["shadowed global Error", socialAttachments.replace("}): Promise<SocialAttachment> {\n  try {", "}): Promise<SocialAttachment> {\n  class Error extends globalThis.Error {}\n  try {"), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["disconnected first try wrapper", socialAttachmentPicker.replace("export async function pickSocialAttachmentFile(scope: SocialAttachmentPickerScope) {\n  try {", 'export async function pickSocialAttachmentFile(scope: SocialAttachmentPickerScope) {\n  try {} catch (error) { if (error instanceof UserFacingError) throw error; throw new UserFacingError("attachment_action", "Unable to choose that attachment right now. Try again."); }\n  try {').replace("if (error instanceof UserFacingError) throw error;", "throw error;"), "pickSocialAttachmentFile", "Unable to choose that attachment right now. Try again.", null],
  ["nested raw rethrow helper", socialAttachments.replace('throw new UserFacingError("attachment_action", "Unable to upload that attachment right now. Try again.");', 'function rethrowUnknown() { throw error; } rethrowUnknown(); throw new UserFacingError("attachment_action", "Unable to upload that attachment right now. Try again.");'), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["IIFE raw rethrow", socialAttachments.replace('throw new UserFacingError("attachment_action", "Unable to upload that attachment right now. Try again.");', '(() => { throw error; })(); throw new UserFacingError("attachment_action", "Unable to upload that attachment right now. Try again.");'), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["Promise raw rejection", socialAttachments.replace('throw new UserFacingError("attachment_action", "Unable to upload that attachment right now. Try again.");', 'return Promise.reject(error); throw new UserFacingError("attachment_action", "Unable to upload that attachment right now. Try again.");'), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
  ["identity raw rethrow", socialAttachments.replace('throw new UserFacingError("attachment_action", "Unable to upload that attachment right now. Try again.");', 'const identity = (value) => value; throw identity(error); throw new UserFacingError("attachment_action", "Unable to upload that attachment right now. Try again.");'), "createSocialAttachmentForSurface", "Unable to upload that attachment right now. Try again.", "This attachment is too large for comments/chat right now."],
]) if (collectDomainFailureWrapperViolations(mutation, label, functionName, fallback, requiredCopy).length === 0) {
  fail(`domain failure-wrapper proof accepted mutation: ${label}`);
}
assertNotIncludes(chatInbox, "InboxErrorState", "Chi'lly Chat Inbox error state must stay presentation-safe");
for (const [label, mutation, analyze, sourceFile] of [
  ["renamed catch, destructured message, and setter alias", `${login}\nfunction __unsafePresentationMutation(setError) { try { throw new Error("provider"); } catch (problem) { const { message: raw } = problem; const present = setError; present(raw); } }`, collectCustomerErrorBoundaryViolations, "app/(auth)/login.tsx"],
  ["raw provider message trusted through String and alias", `${chatDomain}\nfunction __unsafeTrustMutation(created) { const Alias = UserFacingError; throw new Alias("chat_action", String(created.error.message)); }`, collectDomainErrorPolicyViolations, "_lib/chat.ts"],
  ["raw catch message assigned before setter alias", `${login}\nfunction __unsafeAssignmentMutation(setError) { let raw; try { throw new Error("provider"); } catch (problem) { raw = problem.message; } const present = setError; present(raw); }`, collectCustomerErrorBoundaryViolations, "app/(auth)/login.tsx"],
  ["nested catch parameter error-message destructuring", `${login}\nfunction __unsafeNestedCatch(setError) { try { throw { error: new Error("provider") }; } catch ({ error: { message: raw } }) { setError(raw); } }`, collectCustomerErrorBoundaryViolations, "app/(auth)/login.tsx"],
  ["locally shadowed customer-error sanitizer", `${login}\nfunction __unsafeShadowedSanitizer(setError) { const getUserFacingErrorMessage = String; try { throw new Error("provider"); } catch (problem) { setError(getUserFacingErrorMessage(problem)); } }`, collectCustomerErrorBoundaryViolations, "app/(auth)/login.tsx"],
  ["deep catch message destructuring", `${login}\nfunction __unsafeDeepCatch(setError) { try { throw { response: { data: { message: "provider" } } }; } catch ({ response: { data: { message: raw } } }) { setError(raw); } }`, collectCustomerErrorBoundaryViolations, "app/(auth)/login.tsx"],
  ["constructor shadowed by a parameter", `${chatDomain}\nfunction __unsafeParameter(UserFacingError, created) { throw new UserFacingError("chat_action", created.error.message); }`, collectDomainErrorPolicyViolations, "_lib/chat.ts"],
  ["approved attachment message reassigned", `${socialAttachments}\nfunction __unsafeReassigned(created) { let copy = getSocialAttachmentValidationMessage(created.file); copy = created.error.message; throw new UserFacingError("attachment_action", copy); }`, collectDomainErrorPolicyViolations, "_lib/socialAttachments.ts"],
  ["approved attachment validator shadowed", `${socialAttachments}\nfunction __unsafeShadowed(created) { const getSocialAttachmentValidationMessage = () => created.error.message; throw new UserFacingError("attachment_action", getSocialAttachmentValidationMessage(created.file)); }`, collectDomainErrorPolicyViolations, "_lib/socialAttachments.ts"],
  ["picker guidance downgraded to Error", socialAttachmentPicker.replace("throw new UserFacingError(", "throw new Error("), collectPlainThrownErrorViolations, "_lib/socialAttachmentPicker.ts"],
  ["picker guidance downgraded through alias", `${socialAttachmentPicker}\nfunction __unsafePickerAlias(copy) { const PickerError = Error; throw new PickerError(copy); }`, collectPlainThrownErrorViolations, "_lib/socialAttachmentPicker.ts"],
]) if (analyze(mutation, label, sourceFile).length === 0) fail(`customer error-boundary proof accepted mutation: ${label}`);
for (const [label, mutation] of [
  ["function declaration", `${login}\nfunction __unsafeDeclaredClosure(setError) { try { throw new Error("provider"); } catch (problem) { function renderDetail() { return String(problem); } setError(renderDetail()); } }`],
  ["assigned function", `${login}\nfunction __unsafeAssignedClosure(setError) { let renderDetail; try { throw new Error("provider"); } catch (problem) { renderDetail = function () { return String(problem); }; setError(renderDetail()); } }`],
  ["member-assigned closure", `${login}\nfunction __unsafeMemberAssignedClosure(setError) { const holder = {}; try { throw new Error("provider"); } catch (problem) { holder.render = () => String(problem); setError(holder.render()); } }`],
  ["nested member-assigned closure", `${login}\nfunction __unsafeNestedMemberClosure(setError) { const holder = { ui: {} }; try { throw new Error("provider"); } catch (problem) { holder.ui.render = () => String(problem); setError(holder.ui.render()); } }`],
  ["default-parameter closure", `${login}\nfunction __unsafeDefaultParameter(setError) { try { throw new Error("provider"); } catch (problem) { const render = (value = problem) => String(value); setError(render()); } }`],
  ["class method closure", `${login}\nfunction __unsafeClassMethod(setError) { try { throw new Error("provider"); } catch (problem) { class Renderer { render(value = problem) { return String(value); } } setError(new Renderer().render()); } }`],
  ["class static closure", `${login}\nfunction __unsafeClassStatic(setError) { try { throw new Error("provider"); } catch (problem) { class Renderer { static render() { return String(problem); } } setError(Renderer.render()); } }`],
  ["class-installed closure", `${login}\nfunction __unsafeClassInstalled(setError) { try { throw new Error("provider"); } catch (problem) { class Renderer { constructor() { this.render = () => String(problem); } } setError(new Renderer().render()); } }`],
  ["higher-order closure", `${login}\nfunction __unsafeHigherOrderClosure(setError) { try { throw new Error("provider"); } catch (problem) { const render = () => () => String(problem); setError(render()()); } }`],
  ["object-method closure", `${login}\nfunction __unsafeObjectClosure(setError) { try { throw new Error("provider"); } catch (problem) { const holder = { render() { return String(problem); } }; setError(holder.render()); } }`],
  ["satisfies-wrapped IIFE", `${login}\nfunction __unsafeSatisfiesIife(setError) { try { throw new Error("provider"); } catch (problem) { setError(((() => String(problem)) satisfies () => string)()); } }`],
  ["reassigned sanitizer alias", `${login}\nfunction __unsafeReassignedSanitizer(setError) { let sanitize = getUserFacingErrorMessage; sanitize = (value) => String(value); try { throw new Error("provider"); } catch (problem) { setError(sanitize(problem, "fallback")); } }`],
  ["assigned then replaced sanitizer alias", `${login}\nfunction __unsafeAssignedSanitizer(setError) { let sanitize; sanitize = getUserFacingErrorMessage; sanitize = (value) => String(value); try { throw new Error("provider"); } catch (problem) { setError(sanitize(problem, "fallback")); } }`],
  ["Promise catch callback", `${login}\nfunction __unsafePromiseCatch(setError, action) { action().catch((problem) => setError(problem.message)); }`],
  ["named Promise rejection", `${login}\nfunction __unsafeNamedPromiseCatch(setError, action) { const rejected = (problem) => setError(problem.message); action().catch(rejected); action().then(undefined, rejected); }`],
  ["provider then callback", `${login}\nfunction __unsafeProviderThen(setError, action) { action().then(({ error: problem }) => setError(problem.message)); }`],
  ["computed provider error", `${login}\nasync function __unsafeComputedProvider(setError, action) { const key = "error"; const { [key]: problem } = await action(); setError(problem.message); }`],
  ["aliased asserted computed provider error", `${login}\nasync function __unsafeAliasedComputedProvider(setError, action) { const first = "error" as const; const key = first; const { [key]: problem } = await action(); setError(problem.message); }`],
  ["assigned Promise rejection", `${login}\nfunction __unsafeAssignedPromiseCatch(setError, action) { let rejected; rejected = (problem) => setError(problem.message); action().catch(rejected); }`],
  ["inline-assigned Promise rejection", `${login}\nfunction __unsafeInlineAssignedPromiseCatch(setError, action) { let rejected; action().catch((rejected = (problem) => setError(problem.message))); }`],
  ["post-declaration member rejection", `${login}\nfunction __unsafeMemberAssignedAlias(setError, action) { const handlers = { rejected(problem) { setError(problem.message); } }; let rejected; rejected = handlers.rejected; action().catch(rejected); }`],
  ["conditional rejection", `${login}\nfunction __unsafeConditionalRejection(setError, action, flag) { const handlers = { rejected(problem) { setError(problem.message); } }; action().catch(flag ? handlers.rejected : handlers.rejected); }`],
  ["React useCallback rejection", `${login}\nfunction __unsafeReactUseCallback(setError, action) { const rejected = React.useCallback((problem) => setError(problem.message), [setError]); action().catch(rejected); }`],
  ["identity-wrapped rejection", `${login}\nfunction identity(value) { return value; } function __unsafeWrappedCallback(setError, action) { action().catch(identity((problem) => setError(problem.message))); }`],
  ["callback producer rejection", `${login}\nfunction __unsafeProducedCallback(setError, action) { const handlers = { fail(problem) { setError(problem.message); } }; const choose = () => handlers.fail; action().catch(choose()); }`],
  ["reflected callback", `${login}\nfunction __unsafeReflectedCallback(setError, action) { const handlers = { fail(problem) { setError(problem.message); } }; action().catch(Reflect.get(handlers, "fail")); }`],
  ["array at callback", `${login}\nfunction __unsafeArrayAtCallback(setError, action) { const fail = (problem) => setError(problem.message); action().catch([fail].at(0)); }`],
  ["Object.assign callback", `${login}\nfunction __unsafeAssignedContainer(setError, action) { const base = { fail(problem) { setError(problem.message); } }; const handlers = Object.assign({}, base); action().catch(handlers.fail); }`],
  ["conditional container callback", `${login}\nfunction __unsafeConditionalContainer(setError, action, flag) { action().catch((flag ? { run: problem => setError(problem.message) } : { run: problem => setError(problem.message) }).run); }`],
  ["staged conditional container callback", `${login}\nfunction __unsafeStagedConditionalContainer(setError, action, flag) { const handlers = flag ? { run: problem => setError(problem.message) } : { run: problem => setError(problem.message) }; action().catch(handlers.run); }`],
  ["error event callback", `${login}\nfunction __unsafeErrorEvent(setError, emitter) { emitter.addListener("error", problem => setError(problem.message)); }`],
  ["destructured error event callback", `${login}\nfunction __unsafeDestructuredErrorEvent(setError, emitter) { emitter.on("error", ({ message }) => setError(message)); }`],
  ["useCallback Promise rejection", `${login}\nfunction __unsafeHookPromiseCatch(setError, action) { const rejected = useCallback((problem) => setError(problem.message), []); action().catch(rejected); }`],
  ["object Promise rejection", `${login}\nfunction __unsafeObjectPromiseCatch(setError, action) { const handlers = { rejected(problem) { setError(problem.message); } }; action().catch(handlers.rejected); }`],
  ["class Promise rejection", `${login}\nfunction __unsafeClassPromiseCatch(setError, action) { class Handlers { rejected(problem) { setError(problem.message); } } const handlers = new Handlers(); action().catch(handlers.rejected); }`],
  ["member callback alias", `${login}\nfunction __unsafeMemberAlias(setError, action) { const handlers = { rejected(problem) { setError(problem.message); } }; const rejected = handlers.rejected; action().catch(rejected); }`],
  ["object callback destructure", `${login}\nfunction __unsafeObjectDestructure(setError, action) { const handlers = { rejected(problem) { setError(problem.message); } }; const { rejected } = handlers; action().catch(rejected); }`],
  ["class callback destructure", `${login}\nfunction __unsafeClassDestructure(setError, action) { class Handlers { rejected(problem) { setError(problem.message); } } const { rejected } = new Handlers(); action().catch(rejected); }`],
  ["assigned callback destructure", `${login}\nfunction __unsafeAssignedDestructure(setError, action) { const handlers = {}; handlers.rejected = (problem) => setError(problem.message); const { rejected } = handlers; action().catch(rejected); }`],
  ["array callback", `${login}\nfunction __unsafeArrayCallback(setError, action) { const handlers = [(problem) => setError(problem.message)]; action().catch(handlers[0]); }`],
  ["array callback destructure", `${login}\nfunction __unsafeArrayDestructure(setError, action) { const handlers = [(problem) => setError(problem.message)]; const [rejected] = handlers; action().catch(rejected); }`],
  ["sequence callback", `${login}\nfunction __unsafeSequenceCallback(setError, action) { const rejected = (problem) => setError(problem.message); action().catch((undefined, rejected)); }`],
  ["bound callback", `${login}\nfunction __unsafeBoundCallback(setError, action) { const rejected = (problem) => setError(problem.message); action().catch(rejected.bind(null)); }`],
  ["spread callback destructure", `${login}\nfunction __unsafeSpreadCallback(setError, action) { const base = { rejected(problem) { setError(problem.message); } }; const handlers = { ...base }; const { rejected } = handlers; action().catch(rejected); }`],
  ["default callback destructure", `${login}\nfunction __unsafeDefaultCallback(setError, action) { const { rejected = (problem) => setError(problem.message) } = {}; action().catch(rejected); }`],
  ["assigned callback destructure", `${login}\nfunction __unsafeAssignedCallback(setError, action) { const handlers = { fail(problem) { setError(problem.message); } }; let fail; ({ fail } = handlers); action().catch(fail); }`],
  ["nested assigned callback destructure", `${login}\nfunction __unsafeNestedAssignedCallback(setError, action) { const handlers = { nested: { fail(problem) { setError(problem.message); } } }; let fail; ({ nested: { fail } } = handlers); action().catch(fail); }`],
  ["static class callback destructure", `${login}\nfunction __unsafeStaticCallback(setError, action) { class Handlers { static fail(problem) { setError(problem.message); } } const { fail } = Handlers; action().catch(fail); }`],
  ["rest callback destructure", `${login}\nfunction __unsafeRestCallback(setError, action) { const base = { rejected(problem) { setError(problem.message); } }; const { ...handlers } = base; action().catch(handlers.rejected); }`],
  ["defaulted provider callback", `${login}\nfunction __unsafeDefaultedProviderThen(setError, action) { action().then(({ error: problem } = {}) => setError(problem.message)); }`],
  ["unsafe sanitizer fallback", `${login}\nfunction __unsafeSanitizerFallback(setError) { try { throw new Error("provider"); } catch (problem) { const raw = problem.message; setError(getUserFacingErrorMessage(problem, raw)); } }`],
  ["member-staged raw message", `${login}\nfunction __unsafeMemberRaw(setError) { const state = {}; try { throw new Error("provider"); } catch (problem) { state.detail = problem.message; setError(state.detail); } }`],
  ["optional presentation", `${login}\nfunction __unsafeOptionalPresentation(setError) { try { throw new Error("provider"); } catch (problem) { setError?.(problem.message); } }`],
  ["asserted presentation", `${login}\nfunction __unsafeAssertedPresentation(setError) { try { throw new Error("provider"); } catch (problem) { (setError as (value: string) => void)(problem.message); } }`],
  ["satisfies and bound presentation", `${login}\nfunction __unsafeDerivedPresentation(setError) { try { throw new Error("provider"); } catch (problem) { (setError satisfies (value: string) => void)(problem.message); setError.bind(null)(problem.message); Reflect.apply(setError, null, [problem.message]); } }`],
  ["presentation call", `${login}\nfunction __unsafePresentationCall(setError) { try { throw new Error("provider"); } catch (problem) { setError.call(null, problem.message); } }`],
  ["logical presentation", `${login}\nfunction __unsafeLogicalPresentation(setError, noop) { try { throw new Error("provider"); } catch (problem) { (setError || noop)(problem.message); (setError ?? noop)(problem.message); } }`],
  ["forwarded presentation", `${login}\nfunction __unsafeForwardedPresentation(setError) { const present = (sink, copy) => sink(copy); try { throw new Error("provider"); } catch (problem) { present(setError, problem.message); } }`],
  ["stored presentation", `${login}\nfunction __unsafeStoredPresentation(setError) { const holder = {}; holder.show = setError; try { throw new Error("provider"); } catch (problem) { holder.show(problem.message); } }`],
  ["array presentation", `${login}\nfunction __unsafeArrayPresentation(setError) { const [present] = [setError]; try { throw new Error("provider"); } catch (problem) { present(problem.message); } }`],
  ["destructured staged raw message", `${login}\nfunction __unsafeDestructuredRaw(setError) { const state = {}; try { throw new Error("provider"); } catch (problem) { state.detail = problem.message; const { detail } = state; setError(detail); } }`],
  ["computed error and alert", `${login}\nasync function __unsafeComputedNames(action) { const { ["err" + "or"]: problem } = await action(); Alert[\`alert\`]("Error", problem.message); }`],
  ["nested array presentation", `${login}\nfunction __unsafeNestedArray(setError) { const sinks = [[setError]]; try {} catch (problem) { sinks[0][0](problem.message); } }`],
  ["iterator presentation", `${login}\nfunction __unsafeIterator(setError) { try {} catch (problem) { [problem.message].forEach(setError); } }`],
  ["Map presentation", `${login}\nfunction __unsafeMap(setError) { const sinks = new Map([["error", setError]]); try {} catch (problem) { sinks.get("error")(problem.message); } }`],
  ["member setter presentation", `${login}\nfunction __unsafeMemberSetter(props) { try {} catch (problem) { props.setError(problem.message); } }`],
  ["defined member presentation", `${login}\nfunction __unsafeDefinedSetter(setError) { const holder = {}; Object.defineProperty(holder, "show", { value: setError }); try {} catch (problem) { holder.show(problem.message); } }`],
  ["captured bind presentation", `${login}\nfunction __unsafeCapturedBind(setError) { const present = setError.bind; try { throw new Error("provider"); } catch (problem) { present(null, problem.message); } }`],
  ["aliased Reflect presentation", `${login}\nfunction __unsafeAliasedReflect(setError) { const invoke = Reflect.apply; try { throw new Error("provider"); } catch (problem) { invoke(setError, null, [problem.message]); } }`],
]) {
  if (collectCustomerErrorBoundaryViolations(mutation, `Login ${label} mutation`, "app/(auth)/login.tsx").length === 0) fail(`customer error-boundary proof accepted raw ${label}`);
}
for (const [label, mutation, analyze, sourceFile] of [
  ["wrongly resolved sanitizer module", `${login}\nimport { getUserFacingErrorMessage as unsafeSanitize } from "./userFacingErrors";\nfunction __unsafeImportedSanitizer(setError) { try { throw new Error("provider"); } catch (problem) { setError(unsafeSanitize(problem, "fallback")); } }`, collectCustomerErrorBoundaryViolations, "app/(auth)/login.tsx"],
  ["re-exported constructor consumer", `${chatDomain}\nimport { TrustedError } from "./trustedErrors";\nfunction __unsafeImportedConstructor(created) { throw new TrustedError("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["aliased re-exported constructor", `${chatDomain}\nimport { TrustedError } from "./trustedErrors";\nfunction __unsafeAliasedImportedConstructor(created) { const LocalError = TrustedError; throw new LocalError("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["wrapped and subclassed re-exported constructor", `${chatDomain}\nimport { TrustedError } from "./trustedErrors";\nfunction __unsafeWrappedConstructor(created) { const LocalError = ((...args) => new TrustedError(...args)) as typeof TrustedError; class ChildError extends LocalError {} throw new ChildError("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["namespace re-exported constructor", `${chatDomain}\nimport * as TrustedErrors from "./trustedErrors";\nfunction __unsafeNamespaceImportedConstructor(created) { throw new TrustedErrors.TrustedError("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["required re-exported constructor", `${chatDomain}\nfunction __unsafeRequiredConstructor(created) { const { TrustedError } = require("./trustedErrors"); throw new TrustedError("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["imported error factory", `${chatDomain}\nimport { buildError } from "./trustedErrors";\nfunction __unsafeImportedFactory(created) { throw buildError("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["generic imported constructor", `${chatDomain}\nimport { DomainProblem as Boom } from "./problems";\nfunction __unsafeGenericConstructor(created) { throw new Boom("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["generic imported factory", `${chatDomain}\nimport { makeFailure } from "./problems";\nfunction __unsafeGenericFactory(created) { throw makeFailure("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["generic namespace factory", `${chatDomain}\nimport * as Problems from "./problems";\nfunction __unsafeGenericNamespace(created) { throw Problems.make("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["staged imported error", `${chatDomain}\nimport { buildError } from "./trustedErrors";\nasync function __unsafeStagedImportedError(created) { const problem = await buildError(created.error.message); throw problem; }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["assigned imported constructor", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeAssignedImportedError(created) { let LocalError; LocalError = DomainProblem; throw new LocalError("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["returned imported error", `${chatDomain}\nimport { makeFailure as make } from "./problems";\nfunction __unsafeReturnedImportedError(created) { return make(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["dynamic imported constructor", `${chatDomain}\nasync function __unsafeDynamicImportedError(created) { const { TrustedError } = await import("./trustedErrors"); throw new TrustedError("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["dynamic generic constructor path", `${chatDomain}\nasync function __unsafeDynamicGenericError(created) { const modulePath = "./problems"; const { DomainProblem } = await import(modulePath); throw new DomainProblem("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["Object.assign constructor laundering", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeObjectAssignError(created) { const box = {}; Object.assign(box, { Ctor: DomainProblem }); throw new box.Ctor("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["constructor parameter factory", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeParameterizedFactory(created) { const build = (Ctor, message) => new Ctor("chat_action", message); throw build(DomainProblem, created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["array constructor laundering", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeArrayConstructor(created) { const factories = [DomainProblem]; throw new factories[0](created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["spread constructor laundering", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeSpreadConstructor(created) { const source = { Ctor: DomainProblem }; const box = { ...source }; throw new box.Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["resolved constructor laundering", `${chatDomain}\nimport { DomainProblem } from "./problems";\nasync function __unsafeResolvedConstructor(created) { const Ctor = await Promise.resolve(DomainProblem); throw new Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["arrow constructor closure", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeArrowFactory(created) { const build = () => new DomainProblem(created.error.message); throw build(); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["IIFE constructor closure", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeIifeFactory(created) { throw (() => new DomainProblem(created.error.message))(); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["neutral constructor callback", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeNeutralFactory(created) { const Ctor = ((value) => value)(DomainProblem); throw new Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["declared constructor return", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __chooseProblem() { return DomainProblem; } function __unsafeDeclaredReturn(created) { const Ctor = __chooseProblem(); throw new Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["method constructor return", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeMethodReturn(created) { const factory = { choose() { return DomainProblem; } }; const Ctor = factory.choose(); throw new Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["getter constructor return", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeGetterReturn(created) { const factory = { get Ctor() { return DomainProblem; } }; throw new factory.Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["Reflect constructor closure", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeReflectConstruct(created) { const build = () => Reflect.construct(DomainProblem, [created.error.message]); throw build(); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["Reflect factory closure", `${chatDomain}\nimport { makeFailure } from "./problems";\nfunction __unsafeReflectApply(created) { const build = () => Reflect.apply(makeFailure, null, [created.error.message]); throw build(); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["concise Promise constructor callback", `${chatDomain}\nimport { DomainProblem } from "./problems";\nasync function __unsafePromiseCallback(created) { const Ctor = await Promise.resolve().then(() => DomainProblem); throw new Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["concise array constructor callback", `${chatDomain}\nimport { DomainProblem } from "./problems";\nconst __chooseProblem = () => DomainProblem; function __unsafeArrayCallback(created) { const Ctor = [__chooseProblem].map((fn) => fn())[0]; throw new Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["member-assigned imported constructor", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeAssignedMember(created) { const box = {}; box.Ctor = DomainProblem; throw new box.Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["Reflect-installed imported constructor", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeReflectMember(created) { const box = {}; Reflect.set(box, "Ctor", DomainProblem); throw new box.Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["descriptor-installed imported constructor", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeDescriptorMember(created) { const box = {}; Object.defineProperty(box, "Ctor", { value: DomainProblem }); throw new box.Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["descriptors-installed imported constructor", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeDescriptorsMember(created) { const box = {}; Object.defineProperties(box, { Ctor: { value: DomainProblem } }); throw new box.Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["reflected descriptor-installed imported constructor", `${chatDomain}\nimport { DomainProblem } from "./problems";\nfunction __unsafeReflectedDescriptorMember(created) { const box = {}; Reflect.defineProperty(box, "Ctor", { value: DomainProblem }); throw new box.Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["static-field imported constructor", `${chatDomain}\nimport { DomainProblem } from "./problems";\nclass __UnsafeFactory { static Ctor = DomainProblem; } function __unsafeStaticField(created) { throw new __UnsafeFactory.Ctor(created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["aliased CommonJS constructor", `${chatDomain}\nfunction __unsafeAliasedRequire(created) { const load = require; const { TrustedError } = load("./trustedErrors"); throw new TrustedError("chat_action", created.error.message); }`, collectUserFacingErrorConstructionViolations, "_lib/chat.ts"],
  ["nested validator module", `${socialAttachmentPicker}\nimport { getSocialAttachmentValidationMessage as unsafeValidate } from "./fake/socialAttachments";\nfunction __unsafeImportedValidator(created) { const message = unsafeValidate(created.file); throw new UserFacingError("attachment_action", message); }`, collectUserFacingErrorConstructionViolations, "_lib/socialAttachmentPicker.ts"],
  ["dynamic validator body", socialAttachments.replace("return null;\n};", "return String(file.uri);\n};"), collectUserFacingErrorConstructionViolations, "_lib/socialAttachments.ts"],
  ["raw sanitizer transform", chillyCircle.replace('.replace(/friend/gi, "Chi\'lly Circle");', '.concat(String(error));'), collectCustomerErrorBoundaryViolations, "app/chilly-circle.tsx"],
]) {
  if (analyze(mutation, label, sourceFile).length === 0) fail(`customer error-boundary proof trusted ${label}`);
}
const safeSanitizerAliasSource = `${login}\nfunction __safeSanitizerAliasMutation(setError) { try { throw new Error(\"provider detail\"); } catch (problem) { const sanitize = getUserFacingErrorMessage; setError(sanitize(problem, \"Unable to continue right now.\")); } }`;
for (const violation of collectCustomerErrorBoundaryViolations(safeSanitizerAliasSource, "Safe sanitizer alias behavior", "app/(auth)/login.tsx")) {
  fail(`customer error-boundary proof rejected a safe sanitizer alias: ${violation}`);
}
for (const [label, source, unsafeExpression] of [
  ["Login", login, "Alert.alert(\"Login Error\", error.message)"],
  ["Chi'lly Chat Inbox", chatInbox, "message: loadError?.message ??"],
  ["Chi'lly Chat Thread load", chatThread, "setError(loadError?.message ??"],
  ["Chi'lly Chat Thread attachment", chatThread, "setError(error instanceof Error ? error.message"],
  ["Chi'lly Chat Thread resume", chatThread, "setError(resumeError instanceof Error ? resumeError.message"],
  ["Chi'lly Chat Thread accept", chatThread, "setError(acceptError instanceof Error ? acceptError.message"],
  ["Chi'lly Chat Thread decline", chatThread, "setError(declineError instanceof Error ? declineError.message"],
  ["Chi'lly Chat Invite search", chatInviteSheet, "setError(searchError?.message ??"],
  ["Chi'lly Chat Invite send", chatInviteSheet, "setError(inviteError?.message ??"],
  ["Chi'lly Circle", chillyCircle, "const message = error instanceof Error ? error.message"],
]) {
  assertNotIncludes(source, unsafeExpression, `${label} raw error presentation`);
}
const rootBoundary = read("components/system/root-error-boundary.tsx"); const rootLayout = read("app/_layout.tsx");
assertIncludes(rootBoundary, "errorName: error.name || \"Error\"", "root boundary analytics"); assertNotIncludes(rootBoundary, "defaultSummary={`Runtime issue: ${error.message}`}", "root boundary feedback summary");
assertNotIncludes(rootBoundary, "message: error.message", "root boundary analytics");
assertIncludes(rootLayout, "SENSITIVE_ROUTE_PARAM_NAMES.has(normalizedKey)", "auth redirect sensitive param filter");
assertIncludes(rootLayout, "normalizedKey.includes(\"token\")", "auth redirect token param filter");
const settings = read("app/settings.tsx"); const profile = read("app/profile/[userId].tsx");
const support = read("components/system/support-screen.tsx"); const copyrightReport = read("app/copyright-report.tsx");
const platformStudio = read("app/channel-settings.tsx"); const player = read("app/player/[id].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx"); const liveEffectsSheet = read("components/live/live-effects-sheet.tsx");
const nativeAdSlot = read("components/ads/NativeAdSlot.tsx"); const communicationPreviewCard = read("components/communication/communication-preview-card.tsx");
const monetization = read("_lib/monetization.ts"); const premiumWatchPartyAccess = read("_lib/premiumWatchPartyAccess.ts");
const spectatorAccess = read("_lib/spectatorAccess.ts"); const mediaStorage = read("_lib/mediaStorage.ts");
const creatorVideos = read("_lib/creatorVideos.ts"); const liveKitTokenContract = read("_lib/livekit/token-contract.ts");
const legalPolicies = read("legal/policies.mjs"); const legalSiteBuild = read("public-site/legal-site/build.mjs"); const usernameHelper = read("_lib/usernameHandles.ts");
for (const [label, source] of [["Settings", settings], ["Profile", profile], ["Support", support], ["Copyright report", copyrightReport], ["Platform Studio", platformStudio]]) {
  assertIncludes(source, "getUserFacingErrorMessage", `${label} sanitized error usage`);
}
assertNotIncludes(settings, "Alert.alert(\"Log Out\", error.message)", "Settings logout raw error alert");
assertNotIncludes(settings, "setPasswordNotice(error.message)", "Settings password raw error notice");
assertNotIncludes(support, "error instanceof Error ? error.message : \"Try again in a moment.\"", "Support raw feedback error");
assertNotIncludes(copyrightReport, "error instanceof Error ? error.message : \"Unable to submit this copyright report right now.\"", "Copyright raw submit error");
assertIncludes(usernameHelper, "getUsernameErrorMessage", "username safe error mapper");
assertIncludes(usernameHelper, "Couldn't update username. Try again.", "username safe fallback copy");
assertNotIncludes(usernameHelper, "RLS", "username helper raw RLS copy");
assertNotIncludes(usernameHelper, "unique constraint", "username helper raw unique constraint copy");
assertNotIncludes(usernameHelper, "duplicate key value", "username helper raw duplicate key copy");
const normalUserCopyChecks = [
  ["Live effects sheet", liveEffectsSheet, ["CHI’LLYFECTS FOUNDATION", "does not process the outgoing camera track", "Real processing is still a later lane"]],
  ["Live Stage", liveStage, ["LiveKit server unavailable", "LiveKit join unavailable", "No healthy LiveKit server heartbeat", "does not process the outgoing LiveKit camera track", "selectable as a foundation only"]],
  ["Native ad slot", nativeAdSlot, ["Ad placeholder", "Native/feed placement foundation", "No real ad is loaded"]],
  ["Chi'lly Chat call preview", communicationPreviewCard, ["development build", "debug build"]],
  ["Player", player, ["provider proof", "This upload could not be loaded from storage", "does not process the outgoing LiveKit camera track"]],
  ["Platform Studio creator copy", platformStudio, ["creator storage", "Percent progress is not backed", "backed metadata", "landed audience schema", "schema truth", "provider proof", "No money rows returned", "No digital sales rows yet", "No tips rows yet", "No Watch-Party seat rows yet", "No paid content rows yet", "No merch rows yet", "No payout rows yet", "No verified ledger rows yet", "ledger rows", "raw payloads", "not provider-backed", "not wired"]],
  ["Premium copy", monetization, ["Premium proof is being rechecked", "RevenueCat proof is rechecked", "trusted entitlement truth"]],
  ["Premium live copy", premiumWatchPartyAccess, ["temporarily open for proof"]],
  ["Spectator copy", spectatorAccess, ["broadcast proof exists"]],
  ["Media upload copy", mediaStorage, ["Media storage", "incomplete upload contract"]],
  ["Creator video copy", creatorVideos, ["Creator storage", "Storage global and bucket limits", "Creator media storage"]],
  ["LiveKit token copy", liveKitTokenContract, ["backend token endpoint", "token issuance failed", "LiveKit token requests require"]],
];
for (const [label, source, forbiddenPhrases] of normalUserCopyChecks) for (const phrase of forbiddenPhrases) assertNotIncludes(source, phrase, `${label} normal-user technical copy`);
for (const phrase of ["approved backend deletion", "magic instant wipe", "service-role credentials", "Profile, Channel", "channel display", "Channel setup", "public channel", "token request metadata", "Supabase"]) assertNotIncludes(legalPolicies, phrase, "Public legal policy normal-user technical copy");
assertIncludes(legalPolicies, "approved deletion or de-identification process", "Account deletion production copy");
assertIncludes(legalSiteBuild, "[\"channel\", \"Platform\"]", "Public DMCA Platform option label");
assertNotIncludes(legalSiteBuild, "Public DMCA form disabled: Supabase public URL or public anon key is not configured for this static build.", "Public DMCA unavailable copy");
assertNotIncludes(legalSiteBuild, "Attachment upload token was not returned for this case.", "Public DMCA attachment copy");
if (process.exitCode) process.exit(process.exitCode);
console.log("Critical UX polish policy guard passed.");
