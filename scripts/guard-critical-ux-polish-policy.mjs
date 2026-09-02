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

const fail = (message) => {
  console.error(`Critical UX polish policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const getPropertyName = (pathValue) => {
  if (!pathValue?.isMemberExpression?.() && !pathValue?.isOptionalMemberExpression?.()) return "";
  const property = pathValue.get("property");
  if (!pathValue.node.computed && property.isIdentifier()) return property.node.name;
  return property.isStringLiteral() ? property.node.value : "";
};

const getBindingByName = (sourcePath, name) => {
  let currentPath = sourcePath;
  while (currentPath) {
    const binding = currentPath.scope?.getBinding(name);
    if (binding) return binding;
    currentPath = currentPath.parentPath;
  }
  return null;
};

const getBinding = (identifierPath) => (
  identifierPath?.isIdentifier?.()
    ? getBindingByName(identifierPath, identifierPath.node.name)
    : null
);

const getRootIdentifierPath = (expressionPath) => {
  let currentPath = expressionPath;
  while (
    currentPath?.isMemberExpression?.()
    || currentPath?.isOptionalMemberExpression?.()
  ) {
    currentPath = currentPath.get("object");
  }
  return currentPath?.isIdentifier?.() ? currentPath : null;
};

const isRawErrorObjectExpression = (expressionPath, rawErrorBindings, allowNameHeuristic = true) => {
  if (!expressionPath?.node) return false;
  if (expressionPath.isIdentifier()) {
    const binding = getBinding(expressionPath);
    return (binding && rawErrorBindings.has(binding))
      || (allowNameHeuristic && /error/i.test(expressionPath.node.name));
  }
  if (expressionPath.isMemberExpression() || expressionPath.isOptionalMemberExpression()) {
    return getPropertyName(expressionPath) === "error";
  }
  if (
    expressionPath.isTSAsExpression?.()
    || expressionPath.isTSNonNullExpression?.()
    || expressionPath.isTypeCastExpression?.()
    || expressionPath.isParenthesizedExpression?.()
  ) {
    return isRawErrorObjectExpression(
      expressionPath.get("expression"),
      rawErrorBindings,
      allowNameHeuristic,
    );
  }
  return false;
};

const isRawMessageMemberPath = (memberPath, rawErrorBindings) => {
  if (getPropertyName(memberPath) !== "message") return false;
  return isRawErrorObjectExpression(memberPath.get("object"), rawErrorBindings);
};

const isUserFacingSanitizerExpression = (expressionPath, sanitizerBindings) => {
  if (!expressionPath?.node) return false;
  if (expressionPath.isIdentifier()) {
    const binding = getBinding(expressionPath);
    return ["getUserFacingErrorMessage", "normalizeCircleError"].includes(expressionPath.node.name)
      || (!!binding && sanitizerBindings.has(binding));
  }
  return (expressionPath.isMemberExpression() || expressionPath.isOptionalMemberExpression())
    && getPropertyName(expressionPath) === "getUserFacingErrorMessage";
};

const isUserFacingSanitizerCall = (callPath, sanitizerBindings) => (
  callPath?.isCallExpression?.()
  && isUserFacingSanitizerExpression(callPath.get("callee"), sanitizerBindings)
);

const expressionContainsRawMessage = (
  expressionPath,
  rawMessageBindings,
  rawErrorBindings,
  sanitizerBindings,
) => {
  if (!expressionPath?.node) return false;
  if (expressionPath.isFunction?.()) return false;
  if (isUserFacingSanitizerCall(expressionPath, sanitizerBindings)) return false;
  if (isRawMessageMemberPath(expressionPath, rawErrorBindings)) return true;
  if (expressionPath.isIdentifier()) {
    const binding = getBinding(expressionPath);
    return !!binding && (rawMessageBindings.has(binding) || rawErrorBindings.has(binding));
  }
  let found = false;
  expressionPath.traverse({
    Function(innerPath) {
      const parentPath = innerPath.parentPath;
      const isImmediatelyInvoked = (
        parentPath?.isCallExpression?.()
        || parentPath?.isOptionalCallExpression?.()
      ) && parentPath.get("callee").node === innerPath.node;
      if (!isImmediatelyInvoked) innerPath.skip();
    },
    CallExpression(innerPath) {
      if (isUserFacingSanitizerCall(innerPath, sanitizerBindings)) innerPath.skip();
    },
    MemberExpression(innerPath) {
      if (isRawMessageMemberPath(innerPath, rawErrorBindings)) {
        found = true;
        innerPath.stop();
      }
    },
    OptionalMemberExpression(innerPath) {
      if (isRawMessageMemberPath(innerPath, rawErrorBindings)) {
        found = true;
        innerPath.stop();
      }
    },
    Identifier(innerPath) {
      const binding = getBinding(innerPath);
      if (binding && (rawMessageBindings.has(binding) || rawErrorBindings.has(binding))) {
        found = true;
        innerPath.stop();
      }
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
  return patternPath.getBindingIdentifiers
    ? Object.keys(patternPath.getBindingIdentifiers()).flatMap((name) => {
      const binding = getBindingByName(patternPath, name);
      return binding ? [binding] : [];
    })
    : [];
};

const objectPatternRawErrorBindings = (patternPath) => {
  if (!patternPath?.isObjectPattern?.()) return [];
  return patternPath.get("properties").flatMap((propertyPath) => {
    if (!propertyPath.isObjectProperty()) return [];
    const key = propertyPath.get("key");
    const keyName = key.isIdentifier() ? key.node.name : key.isStringLiteral() ? key.node.value : "";
    return keyName === "error" ? getPatternBindings(propertyPath.get("value")) : [];
  });
};

const objectPatternMessageBindings = (patternPath, sourceIsRawErrorObject) => {
  if (!patternPath?.isObjectPattern?.()) return [];
  return patternPath.get("properties").flatMap((propertyPath) => {
    if (!propertyPath.isObjectProperty()) return [];
    const key = propertyPath.get("key");
    const value = propertyPath.get("value");
    const keyName = key.isIdentifier() ? key.node.name : key.isStringLiteral() ? key.node.value : "";
    if (keyName === "message" && sourceIsRawErrorObject) return getPatternBindings(value);
    if (keyName === "error" && value.isObjectPattern()) return objectPatternMessageBindings(value, true);
    return [];
  });
};

const isDirectPresentationExpression = (expressionPath, presentationBindings) => {
  if (!expressionPath?.node) return false;
  if (expressionPath.isIdentifier()) {
    const binding = getBinding(expressionPath);
    return /^set.*(?:Error|Notice|Feedback|Status|Message)$/i.test(expressionPath.node.name)
      || (!!binding && presentationBindings.has(binding));
  }
  return (expressionPath.isMemberExpression() || expressionPath.isOptionalMemberExpression())
    && getPropertyName(expressionPath) === "alert"
    && expressionPath.get("object").isIdentifier({ name: "Alert" });
};

const isTrustedErrorConstructorExpression = (
  expressionPath,
  trustedErrorConstructorBindings,
  trustedErrorContainerProperties,
) => {
  if (expressionPath?.isIdentifier?.()) {
    const binding = getBinding(expressionPath);
    return expressionPath.node.name === "UserFacingError"
      || (!!binding && trustedErrorConstructorBindings.has(binding));
  }
  if (expressionPath?.isMemberExpression?.() || expressionPath?.isOptionalMemberExpression?.()) {
    const rootBinding = getBinding(getRootIdentifierPath(expressionPath));
    const trustedProperties = rootBinding
      ? trustedErrorContainerProperties.get(rootBinding)
      : null;
    return !!rootBinding && (
      trustedErrorConstructorBindings.has(rootBinding)
      || trustedProperties?.has("*")
      || trustedProperties?.has(getPropertyName(expressionPath))
    );
  }
  return false;
};

const getTrustedErrorContainerPropertyNames = (
  sourcePath,
  trustedErrorConstructorBindings,
  trustedErrorContainerProperties,
) => {
  if (sourcePath?.isIdentifier?.()) {
    const sourceBinding = getBinding(sourcePath);
    return sourceBinding
      ? [...(trustedErrorContainerProperties.get(sourceBinding) ?? [])]
      : [];
  }
  if (sourcePath?.isMemberExpression?.() || sourcePath?.isOptionalMemberExpression?.()) {
    return isTrustedErrorConstructorExpression(
      sourcePath,
      trustedErrorConstructorBindings,
      trustedErrorContainerProperties,
    ) ? ["*"] : [];
  }
  if (sourcePath?.isArrayExpression?.()) {
    return sourcePath.get("elements").some((elementPath) => (
      isTrustedErrorConstructorExpression(
        elementPath,
        trustedErrorConstructorBindings,
        trustedErrorContainerProperties,
      )
      || getTrustedErrorContainerPropertyNames(
        elementPath,
        trustedErrorConstructorBindings,
        trustedErrorContainerProperties,
      ).length > 0
    )) ? ["*"] : [];
  }
  if (!sourcePath?.isObjectExpression?.()) return [];
  const trustedProperties = [];
  for (const propertyPath of sourcePath.get("properties")) {
    if (!propertyPath.isObjectProperty()) continue;
    const key = propertyPath.get("key");
    const value = propertyPath.get("value");
    const keyName = key.isIdentifier() ? key.node.name : key.isStringLiteral() ? key.node.value : "";
    if (!keyName) continue;
    if (isTrustedErrorConstructorExpression(
      value,
      trustedErrorConstructorBindings,
      trustedErrorContainerProperties,
    )) {
      trustedProperties.push(keyName);
      continue;
    }
    if (getTrustedErrorContainerPropertyNames(
      value,
      trustedErrorConstructorBindings,
      trustedErrorContainerProperties,
    ).length > 0) {
      trustedProperties.push(keyName, "*");
    }
  }
  return trustedProperties;
};

const getTrustedConstructorPatternBindings = (
  patternPath,
  sourcePath,
  trustedErrorConstructorBindings,
  trustedErrorContainerProperties,
) => {
  if (!patternPath?.isObjectPattern?.() && !patternPath?.isArrayPattern?.()) return [];
  const trustedProperties = new Set(getTrustedErrorContainerPropertyNames(
    sourcePath,
    trustedErrorConstructorBindings,
    trustedErrorContainerProperties,
  ));
  if (!trustedProperties.size) return [];
  if (patternPath.isArrayPattern() || trustedProperties.has("*")) {
    return getPatternBindings(patternPath).filter(
      (binding) => !trustedErrorConstructorBindings.has(binding),
    );
  }
  return patternPath.get("properties").flatMap((propertyPath) => {
    if (!propertyPath.isObjectProperty()) return [];
    const key = propertyPath.get("key");
    const keyName = key.isIdentifier() ? key.node.name : key.isStringLiteral() ? key.node.value : "";
    if (!trustedProperties.has(keyName)) return [];
    return getPatternBindings(propertyPath.get("value")).filter(
      (binding) => !trustedErrorConstructorBindings.has(binding),
    );
  });
};

const collectCustomerErrorBoundaryViolations = (source, file) => {
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
  const rawErrorBindings = new Set();
  const rawResultBindings = new Set();
  const rawMessageBindings = new Set();
  const presentationBindings = new Set();
  const sanitizerBindings = new Set();
  const trustedErrorConstructorBindings = new Set();
  const trustedErrorContainerProperties = new Map();
  const declarators = [];
  const assignments = [];

  const isUntrustedResultExpression = (expressionPath) => {
    if (!expressionPath?.node) return false;
    if (
      expressionPath.isTSAsExpression?.()
      || expressionPath.isTSNonNullExpression?.()
      || expressionPath.isTypeCastExpression?.()
      || expressionPath.isParenthesizedExpression?.()
    ) return isUntrustedResultExpression(expressionPath.get("expression"));
    if (expressionPath.isAwaitExpression()) return true;
    if (expressionPath.isIdentifier()) {
      const binding = getBinding(expressionPath);
      return !!binding && rawResultBindings.has(binding);
    }
    return false;
  };

  traverse(ast, {
    CatchClause(catchPath) {
      const parameter = catchPath.get("param");
      for (const binding of getPatternBindings(parameter)) {
        rawErrorBindings.add(binding);
        rawMessageBindings.add(binding);
      }
    },
    ImportSpecifier(importPath) {
      const imported = importPath.get("imported");
      const importedName = imported.isIdentifier() ? imported.node.name : imported.isStringLiteral() ? imported.node.value : "";
      if (importedName === "UserFacingError") {
        const binding = getBinding(importPath.get("local"));
        if (binding) trustedErrorConstructorBindings.add(binding);
      }
      if (importedName === "getUserFacingErrorMessage") {
        const binding = getBinding(importPath.get("local"));
        if (binding) sanitizerBindings.add(binding);
      }
    },
    ImportNamespaceSpecifier(importPath) {
      const source = importPath.parentPath?.get("source");
      if (!source?.isStringLiteral?.() || !/userFacingErrors$/u.test(source.node.value)) return;
      const binding = getBinding(importPath.get("local"));
      if (binding) trustedErrorContainerProperties.set(binding, new Set(["UserFacingError"]));
    },
    VariableDeclarator(declaratorPath) {
      declarators.push(declaratorPath);
    },
    AssignmentExpression(assignmentPath) {
      assignments.push(assignmentPath);
    },
  });

  let changed = true;
  while (changed) {
    changed = false;
    for (const declaratorPath of declarators) {
      const id = declaratorPath.get("id");
      const init = declaratorPath.get("init");
      if (!init?.node) continue;
      const idBindings = getPatternBindings(id);
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
      if (isUserFacingSanitizerExpression(init, sanitizerBindings)) {
        for (const binding of idBindings) {
          if (!sanitizerBindings.has(binding)) {
            sanitizerBindings.add(binding);
            changed = true;
          }
        }
      }
      if (id.isIdentifier()) {
        const trustedProperties = getTrustedErrorContainerPropertyNames(
          init,
          trustedErrorConstructorBindings,
          trustedErrorContainerProperties,
        );
        const containerBinding = getBinding(id);
        if (containerBinding && trustedProperties.length) {
          const currentProperties = trustedErrorContainerProperties.get(containerBinding) ?? new Set();
          for (const propertyName of trustedProperties) {
            if (!currentProperties.has(propertyName)) {
              currentProperties.add(propertyName);
              changed = true;
            }
          }
          trustedErrorContainerProperties.set(containerBinding, currentProperties);
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
      const nextMessageBindings = id.isObjectPattern()
        ? objectPatternMessageBindings(id, isRawErrorObjectExpression(init, rawErrorBindings))
        : expressionContainsRawMessage(init, rawMessageBindings, rawErrorBindings, sanitizerBindings)
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
      for (const binding of getTrustedConstructorPatternBindings(
        id,
        init,
        trustedErrorConstructorBindings,
        trustedErrorContainerProperties,
      )) {
        trustedErrorConstructorBindings.add(binding);
        changed = true;
      }
      if (isTrustedErrorConstructorExpression(
        init,
        trustedErrorConstructorBindings,
        trustedErrorContainerProperties,
      )) {
        for (const binding of idBindings) {
          if (!trustedErrorConstructorBindings.has(binding)) {
            trustedErrorConstructorBindings.add(binding);
            changed = true;
          }
        }
      }
    }
    for (const assignmentPath of assignments) {
      const leftBindings = getPatternBindings(assignmentPath.get("left"));
      const right = assignmentPath.get("right");
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
      if (isUserFacingSanitizerExpression(right, sanitizerBindings)) {
        for (const binding of leftBindings) {
          if (!sanitizerBindings.has(binding)) {
            sanitizerBindings.add(binding);
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
        : assignmentPath.get("left").isObjectPattern()
          ? objectPatternMessageBindings(assignmentPath.get("left"), false)
        : expressionContainsRawMessage(right, rawMessageBindings, rawErrorBindings, sanitizerBindings)
          ? leftBindings
          : [];
      for (const binding of nextMessageBindings) {
          if (!rawMessageBindings.has(binding)) {
            rawMessageBindings.add(binding);
            changed = true;
          }
      }
      if (isDirectPresentationExpression(right, presentationBindings)) {
        for (const binding of leftBindings) {
          if (!presentationBindings.has(binding)) {
            presentationBindings.add(binding);
            changed = true;
          }
        }
      }
      const left = assignmentPath.get("left");
      if (left.isIdentifier()) {
        const trustedProperties = getTrustedErrorContainerPropertyNames(
          right,
          trustedErrorConstructorBindings,
          trustedErrorContainerProperties,
        );
        const containerBinding = getBinding(left);
        if (containerBinding && trustedProperties.length) {
          const currentProperties = trustedErrorContainerProperties.get(containerBinding) ?? new Set();
          for (const propertyName of trustedProperties) {
            if (!currentProperties.has(propertyName)) {
              currentProperties.add(propertyName);
              changed = true;
            }
          }
          trustedErrorContainerProperties.set(containerBinding, currentProperties);
        }
      }
      if (left.isMemberExpression() || left.isOptionalMemberExpression()) {
        const objectBinding = getBinding(getRootIdentifierPath(left));
        const propertyName = getPropertyName(left);
        if (
          objectBinding
          && isTrustedErrorConstructorExpression(
            right,
            trustedErrorConstructorBindings,
            trustedErrorContainerProperties,
          )
        ) {
          const currentProperties = trustedErrorContainerProperties.get(objectBinding) ?? new Set();
          const nextProperty = propertyName || "*";
          if (!currentProperties.has(nextProperty)) {
            currentProperties.add(nextProperty);
            trustedErrorContainerProperties.set(objectBinding, currentProperties);
            changed = true;
          }
        }
      }
      for (const binding of getTrustedConstructorPatternBindings(
        left,
        right,
        trustedErrorConstructorBindings,
        trustedErrorContainerProperties,
      )) {
        trustedErrorConstructorBindings.add(binding);
        changed = true;
      }
      if (isTrustedErrorConstructorExpression(
        right,
        trustedErrorConstructorBindings,
        trustedErrorContainerProperties,
      )) {
        for (const binding of leftBindings) {
          if (!trustedErrorConstructorBindings.has(binding)) {
            trustedErrorConstructorBindings.add(binding);
            changed = true;
          }
        }
      }
    }
  }

  const violations = [];
  traverse(ast, {
    CallExpression(callPath) {
      if (!isDirectPresentationExpression(callPath.get("callee"), presentationBindings)) return;
      if (callPath.get("arguments").some((argument) => expressionContainsRawMessage(
        argument,
        rawMessageBindings,
        rawErrorBindings,
        sanitizerBindings,
      ))) {
        violations.push(`${file}:${callPath.node.loc?.start.line ?? "?"}: raw error message reaches a customer presentation call`);
      }
    },
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
    NewExpression(newExpressionPath) {
      const callee = newExpressionPath.get("callee");
      const calleeBinding = getBinding(callee);
      if (
        !isTrustedErrorConstructorExpression(
          callee,
          trustedErrorConstructorBindings,
          trustedErrorContainerProperties,
        )
        && (!calleeBinding || !trustedErrorConstructorBindings.has(calleeBinding))
      ) return;
      const messageArgument = newExpressionPath.get("arguments")[1];
      if (expressionContainsRawMessage(
        messageArgument,
        rawMessageBindings,
        rawErrorBindings,
        sanitizerBindings,
      )) {
        violations.push(`${file}:${newExpressionPath.node.loc?.start.line ?? "?"}: raw error message is mislabeled as a trusted UserFacingError`);
      }
    },
  });
  return [...new Set(violations)];
};

const collectUserFacingErrorConstructionViolations = (source, file) => {
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
  const approvedMessageBindings = new Set();
  const violations = [];

  // Keep the trust boundary intentionally narrow: domain code constructs the
  // named class directly, and its copy is static or comes from the one approved
  // app-owned attachment validator. Constructor wrappers and aliases are not a
  // supported source pattern, so JavaScript call/container provenance cannot
  // silently turn a provider message into trusted customer copy.

  traverse(ast, {
    VariableDeclarator(declaratorPath) {
      const id = declaratorPath.get("id");
      const init = declaratorPath.get("init");
      if (
        !id.isIdentifier()
        || !init?.isCallExpression?.()
        || !init.get("callee").isIdentifier({ name: "getSocialAttachmentValidationMessage" })
      ) return;
      const binding = getBinding(id);
      if (binding) approvedMessageBindings.add(binding);
    },
  });

  const isApprovedMessage = (messagePath) => {
    if (!messagePath?.node) return false;
    if (messagePath.isStringLiteral()) return true;
    if (messagePath.isTemplateLiteral()) return messagePath.get("expressions").length === 0;
    if (messagePath.isIdentifier()) {
      const binding = getBinding(messagePath);
      return !!binding && approvedMessageBindings.has(binding);
    }
    return false;
  };

  traverse(ast, {
    ImportSpecifier(importPath) {
      const imported = importPath.get("imported");
      const importedName = imported.isIdentifier() ? imported.node.name : imported.isStringLiteral() ? imported.node.value : "";
      if (importedName !== "UserFacingError") return;
      if (!importPath.get("local").isIdentifier({ name: "UserFacingError" })) {
        violations.push(`${file}:${importPath.node.loc?.start.line ?? "?"}: UserFacingError must not be imported through an alias`);
      }
    },
    ImportNamespaceSpecifier(importPath) {
      const sourcePath = importPath.parentPath?.get("source");
      if (sourcePath?.isStringLiteral?.() && /userFacingErrors$/u.test(sourcePath.node.value)) {
        violations.push(`${file}:${importPath.node.loc?.start.line ?? "?"}: UserFacingError must not be imported through a namespace`);
      }
    },
    Identifier(identifierPath) {
      if (identifierPath.node.name !== "UserFacingError") return;
      if (identifierPath.parentPath?.isImportSpecifier?.()) return;
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
      const messageArgument = newExpressionPath.get("arguments")[1];
      if (!isApprovedMessage(messageArgument)) {
        violations.push(`${file}:${newExpressionPath.node.loc?.start.line ?? "?"}: UserFacingError copy must be static or produced by the approved attachment validator`);
      }
    },
  });
  return [...new Set(violations)];
};

const collectDomainErrorPolicyViolations = (source, file) => [
  ...collectCustomerErrorBoundaryViolations(source, file),
  ...collectUserFacingErrorConstructionViolations(source, file),
];

const collectPlainThrownErrorViolations = (source, file) => {
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
  const violations = [];
  const plainErrorConstructorBindings = new Set();
  const plainErrorContainerBindings = new Set();
  const declarators = [];
  const assignments = [];

  const isPlainErrorConstructorExpression = (expressionPath) => {
    if (!expressionPath?.node) return false;
    if (
      expressionPath.isTSAsExpression?.()
      || expressionPath.isTSNonNullExpression?.()
      || expressionPath.isTypeCastExpression?.()
      || expressionPath.isParenthesizedExpression?.()
    ) {
      return isPlainErrorConstructorExpression(expressionPath.get("expression"));
    }
    if (expressionPath.isIdentifier()) {
      const binding = getBinding(expressionPath);
      return (expressionPath.node.name === "Error" && !binding)
        || (!!binding && plainErrorConstructorBindings.has(binding));
    }
    if (expressionPath.isMemberExpression() || expressionPath.isOptionalMemberExpression()) {
      if (
        expressionPath.get("object").isIdentifier({ name: "globalThis" })
        && getPropertyName(expressionPath) === "Error"
      ) return true;
      const rootBinding = getBinding(getRootIdentifierPath(expressionPath));
      return !!rootBinding && plainErrorContainerBindings.has(rootBinding);
    }
    return false;
  };

  const expressionContainsPlainErrorConstructor = (expressionPath) => {
    if (!expressionPath?.node) return false;
    if (isPlainErrorConstructorExpression(expressionPath)) return true;
    if (expressionPath.isObjectExpression()) {
      return expressionPath.get("properties").some((propertyPath) => (
        propertyPath.isObjectProperty()
        && expressionContainsPlainErrorConstructor(propertyPath.get("value"))
      ));
    }
    if (expressionPath.isArrayExpression()) {
      return expressionPath.get("elements").some(expressionContainsPlainErrorConstructor);
    }
    return false;
  };

  traverse(ast, {
    VariableDeclarator(declaratorPath) {
      declarators.push(declaratorPath);
    },
    AssignmentExpression(assignmentPath) {
      assignments.push(assignmentPath);
    },
    Identifier(identifierPath) {
      if (identifierPath.node.name === "Error") {
        violations.push(`${file}:${identifierPath.node.loc?.start.line ?? "?"}: attachment picker guidance must not reference plain Error`);
      }
    },
    StringLiteral(stringPath) {
      if (
        stringPath.node.value === "Error"
        && (stringPath.parentPath?.isMemberExpression?.() || stringPath.parentPath?.isOptionalMemberExpression?.())
      ) {
        violations.push(`${file}:${stringPath.node.loc?.start.line ?? "?"}: attachment picker guidance must not reference plain Error`);
      }
    },
  });

  let changed = true;
  while (changed) {
    changed = false;
    for (const declaratorPath of declarators) {
      if (!expressionContainsPlainErrorConstructor(declaratorPath.get("init"))) continue;
      for (const binding of getPatternBindings(declaratorPath.get("id"))) {
        if (!plainErrorConstructorBindings.has(binding)) {
          plainErrorConstructorBindings.add(binding);
          changed = true;
        }
        if (!plainErrorContainerBindings.has(binding)) {
          plainErrorContainerBindings.add(binding);
          changed = true;
        }
      }
    }
    for (const assignmentPath of assignments) {
      if (!expressionContainsPlainErrorConstructor(assignmentPath.get("right"))) continue;
      for (const binding of getPatternBindings(assignmentPath.get("left"))) {
        if (!plainErrorConstructorBindings.has(binding)) {
          plainErrorConstructorBindings.add(binding);
          changed = true;
        }
        if (!plainErrorContainerBindings.has(binding)) {
          plainErrorContainerBindings.add(binding);
          changed = true;
        }
      }
      const left = assignmentPath.get("left");
      if (left.isMemberExpression() || left.isOptionalMemberExpression()) {
        const rootBinding = getBinding(getRootIdentifierPath(left));
        if (rootBinding && !plainErrorContainerBindings.has(rootBinding)) {
          plainErrorContainerBindings.add(rootBinding);
          changed = true;
        }
      }
    }
  }

  traverse(ast, {
    ThrowStatement(throwPath) {
      const argument = throwPath.get("argument");
      if (
        (argument.isNewExpression() || argument.isCallExpression())
        && isPlainErrorConstructorExpression(argument.get("callee"))
      ) {
        violations.push(`${file}: app-owned picker guidance must use UserFacingError`);
      }
    },
  });
  return [...new Set(violations)];
};

const loadUserFacingErrorModule = async (source, label) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
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
      [
        new UserFacingError("attachment_action", "Photo gallery needs the current app build."),
        "Photo gallery needs the current app build.",
      ],
      [
        new UserFacingError("circle_action", "You cannot request yourself."),
        "You cannot request yourself.",
      ],
    ];
    return cases.flatMap(([error, expected], index) => {
      const actual = getUserFacingErrorMessage(error, fallback);
      return actual === expected ? [] : [`case ${index + 1}: expected ${expected}, received ${actual}`];
    });
  } catch (error) {
    return [`module evaluation failed: ${error instanceof Error ? error.message : String(error)}`];
  }
};

const filesToScanForEntities = [
  "app/(auth)/login.tsx",
  "app/(auth)/signup.tsx",
  "app/(tabs)/index.tsx",
  "app/admin.tsx",
  "app/channel/[userId].tsx",
  "app/channel-settings.tsx",
  "app/chat/[threadId].tsx",
  "app/chat/index.tsx",
  "app/chilly-circle.tsx",
  "app/copyright-report.tsx",
  "app/player/[id].tsx",
  "app/profile/[userId].tsx",
  "app/settings.tsx",
  "app/subscribe.tsx",
  "app/title/[id].tsx",
  "app/watch-party/live-stage/[partyId].tsx",
  "app/watch-party/[partyId].tsx",
  "components/ads/NativeAdSlot.tsx",
  "components/communication/in-room-communication-panel.tsx",
  "components/communication/communication-preview-card.tsx",
  "components/legal/legal-policy-viewer.tsx",
  "components/live/live-effects-sheet.tsx",
  "components/system/root-error-boundary.tsx",
  "components/system/runtime-unavailable-screen.tsx",
  "components/system/support-screen.tsx",
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
assertIncludes(userFacingErrors, "getUserFacingErrorMessage", "shared user-facing error helper");
assertIncludes(userFacingErrors, "class UserFacingError", "trusted domain error type");
assertIncludes(userFacingErrors, "This account does not have permission", "permission-safe error copy");
assertIncludes(userFacingErrors, "Sign in again", "auth-safe error copy");
assertIncludes(userFacingErrors, "Check your connection", "network-safe error copy");
assertIncludes(userFacingErrors, "The email or password is incorrect.", "credential-safe error copy");
assertIncludes(userFacingErrors, "Confirm your email", "email-confirmation-safe error copy");
assertIncludes(userFacingErrors, "Too many attempts.", "rate-limit-safe error copy");
assertIncludes(userFacingErrors, "Unknown messages must fail closed", "unknown-error fail-closed policy");
for (const behaviorFailure of await getUserFacingBehaviorFailures(userFacingErrors, "current")) {
  fail(`shared user-facing error behavior ${behaviorFailure}`);
}

const userFacingErrorMutations = [
  [
    "unknown errors pass through",
    (source) => source.replace(/return fallback;\n}\s*$/, "return rawMessage;\n}"),
  ],
  [
    "broad auth substring classification",
    (source) => source.replace(
      '|| message.includes("authentication")',
      '|| message.includes("authentication")\n    || message.includes("auth")',
    ),
  ],
  [
    "broad object substring classification",
    (source) => source.replace(
      '|| message.includes("object storage")',
      '|| message.includes("object storage")\n    || message.includes("object")',
    ),
  ],
];

for (const [label, mutate] of userFacingErrorMutations) {
  const mutated = mutate(userFacingErrors);
  if (mutated === userFacingErrors) {
    fail(`user-facing error mutation fixture did not apply: ${label}`);
    continue;
  }
  const mutationFailures = await getUserFacingBehaviorFailures(mutated, `mutation-${label.replace(/\W+/g, "-")}`);
  if (mutationFailures.length === 0) {
    fail(`user-facing error behavior guard accepted mutation: ${label}`);
  }
}

const login = read("app/(auth)/login.tsx");
const chatInbox = read("app/chat/index.tsx");
const chatThread = read("app/chat/[threadId].tsx");
const chatInviteSheet = read("components/chat/internal-invite-sheet.tsx");
const chillyCircle = read("app/chilly-circle.tsx");

for (const [label, source] of [
  ["Login", login],
  ["Chi'lly Chat Inbox", chatInbox],
  ["Chi'lly Chat Thread", chatThread],
  ["Chi'lly Chat Invite", chatInviteSheet],
  ["Chi'lly Circle", chillyCircle],
]) {
  assertIncludes(source, "getUserFacingErrorMessage", `${label} sanitized error boundary`);
  for (const violation of collectCustomerErrorBoundaryViolations(source, label)) fail(violation);
}

const chatDomain = read("_lib/chat.ts");
const friendGraph = read("_lib/friendGraph.ts");
const socialAttachments = read("_lib/socialAttachments.ts");
const socialAttachmentPicker = read("_lib/socialAttachmentPicker.ts");

for (const [label, source, code] of [
  ["Chi'lly Chat domain", chatDomain, "chat_action"],
  ["Chi'lly Circle domain", friendGraph, "circle_action"],
  ["Social attachments domain", socialAttachments, "attachment_action"],
  ["Social attachment picker", socialAttachmentPicker, "attachment_action"],
]) {
  assertIncludes(source, "UserFacingError", `${label} trusted domain error type`);
  assertIncludes(source, `\"${code}\"`, `${label} trusted domain error code`);
  for (const violation of collectDomainErrorPolicyViolations(source, label)) fail(violation);
}

for (const violation of collectPlainThrownErrorViolations(socialAttachmentPicker, "Social attachment picker")) fail(violation);
assertNotIncludes(chatInbox, "InboxErrorState", "Chi'lly Chat Inbox error state must stay presentation-safe");

const boundaryMutationCases = [
  [
    "renamed catch, destructured message, and setter alias",
    `${login}\nfunction __unsafePresentationMutation(setError) {\n  try { throw new Error(\"provider detail\"); } catch (problem) {\n    const { message: rawDetail } = problem;\n    const presentFailure = setError;\n    presentFailure(rawDetail);\n  }\n}`,
    "Login mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "raw provider message trusted through String and alias",
    `${chatDomain}\nfunction __unsafeTrustMutation(created) {\n  const TrustedErrorAlias = UserFacingError;\n  const providerDetail = String(created.error.message);\n  throw new TrustedErrorAlias(\"chat_action\", providerDetail);\n}`,
    "Chi'lly Chat trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "raw catch message assigned before setter alias",
    `${login}\nfunction __unsafeAssignmentMutation(setError) {\n  let rawDetail;\n  try { throw new Error(\"provider detail\"); } catch (renamedProblem) {\n    rawDetail = renamedProblem.message;\n  }\n  const presentFailure = setError;\n  presentFailure(rawDetail);\n}`,
    "Login assignment mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "catch parameter message destructuring",
    `${login}\nfunction __unsafeCatchPatternMutation(setError) {\n  try { throw new Error(\"provider detail\"); } catch ({ message: rawDetail }) {\n    setError(rawDetail);\n  }\n}`,
    "Login catch-pattern mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "nested catch parameter error-message destructuring",
    `${login}\nfunction __unsafeNestedCatchPatternMutation(setError) {\n  try { throw { error: new Error(\"provider detail\") }; } catch ({ error: { message: rawDetail } }) {\n    setError(rawDetail);\n  }\n}`,
    "Login nested catch-pattern mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "raw caught error coerced through String",
    `${login}\nfunction __unsafeRawErrorStringMutation(setError) {\n  try { throw new Error(\"provider detail\"); } catch (problem) {\n    setError(String(problem));\n  }\n}`,
    "Login raw-error String mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "raw caught error coerced through template",
    `${login}\nfunction __unsafeRawErrorTemplateMutation(setError) {\n  try { throw new Error(\"provider detail\"); } catch (problem) {\n    setError(\`${"${problem}"}\`);\n  }\n}`,
    "Login raw-error template mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "renamed awaited provider error reaches presentation",
    `${login}\nasync function __unsafeRenamedProviderMutation(setError, provider) {\n  const { error: problem } = await provider();\n  setError(problem.message);\n}`,
    "Login renamed provider-result mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "raw caught error coerced through IIFE",
    `${login}\nfunction __unsafeRawErrorIifeMutation(setError) {\n  try { throw new Error(\"provider detail\"); } catch (problem) {\n    setError((() => String(problem))());\n  }\n}`,
    "Login raw-error IIFE mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "catch rest object reaches presentation",
    `${login}\nfunction __unsafeCatchRestMutation(setError) {\n  try { throw new Error(\"provider detail\"); } catch ({ ...problem }) {\n    setError(problem.message);\n  }\n}`,
    "Login catch-rest mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "deep catch message destructuring reaches presentation",
    `${login}\nfunction __unsafeDeepCatchMutation(setError) {\n  try { throw { response: { data: { message: \"provider detail\" } } }; } catch ({ response: { data: { message: rawDetail } } }) {\n    setError(rawDetail);\n  }\n}`,
    "Login deep catch-pattern mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor stored on object member",
    `${chatDomain}\nfunction __unsafeStructuredTrustMutation(created) {\n  const Holder = { Trusted: UserFacingError };\n  const providerDetail = String(created.error.message);\n  throw new Holder.Trusted(\"chat_action\", providerDetail);\n}`,
    "Chi'lly Chat structured trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted member constructor destructured to alias",
    `${chatDomain}\nfunction __unsafeDestructuredTrustMutation(created) {\n  const Holder = { Trusted: UserFacingError };\n  const { Trusted: TrustedAlias } = Holder;\n  const providerDetail = String(created.error.message);\n  throw new TrustedAlias(\"chat_action\", providerDetail);\n}`,
    "Chi'lly Chat destructured trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor container assigned after declaration",
    `${chatDomain}\nfunction __unsafeAssignedContainerTrustMutation(created) {\n  let Holder;\n  Holder = { Trusted: UserFacingError };\n  const providerDetail = String(created.error.message);\n  throw new Holder.Trusted(\"chat_action\", providerDetail);\n}`,
    "Chi'lly Chat assigned-container trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor destructured from inline object",
    `${chatDomain}\nfunction __unsafeInlineDestructuredTrustMutation(created) {\n  const { Trusted: TrustedAlias } = { Trusted: UserFacingError };\n  const providerDetail = String(created.error.message);\n  throw new TrustedAlias(\"chat_action\", providerDetail);\n}`,
    "Chi'lly Chat inline-destructured trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor container copied through alias",
    `${chatDomain}\nfunction __unsafeContainerAliasTrustMutation(created) {\n  const Holder = { Trusted: UserFacingError };\n  const HolderAlias = Holder;\n  const providerDetail = String(created.error.message);\n  throw new HolderAlias.Trusted(\"chat_action\", providerDetail);\n}`,
    "Chi'lly Chat container-alias trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor nested inside object and array",
    `${chatDomain}\nfunction __unsafeNestedTrustMutation(created) {\n  const Holder = { Nested: [{ Trusted: UserFacingError }] };\n  const providerDetail = String(created.error.message);\n  throw new Holder.Nested[0].Trusted(\"chat_action\", providerDetail);\n}`,
    "Chi'lly Chat nested trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "namespace-imported trusted constructor",
    `${chatDomain}\nimport * as Boundary from \"./userFacingErrors\";\nfunction __unsafeNamespaceTrustMutation(created) {\n  const providerDetail = String(created.error.message);\n  throw new Boundary.UserFacingError(\"chat_action\", providerDetail);\n}`,
    "Chi'lly Chat namespace trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor hidden behind TypeScript assertion",
    `${chatDomain}\nfunction __unsafeAssertedTrustMutation(created) {\n  const Holder = { Trusted: UserFacingError as typeof UserFacingError };\n  throw new Holder.Trusted(\"chat_action\", created.error.message);\n}`,
    "Chi'lly Chat asserted trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor hidden behind object spread",
    `${chatDomain}\nfunction __unsafeSpreadTrustMutation(created) {\n  const Holder = { ...{ Trusted: UserFacingError } };\n  throw new Holder.Trusted(\"chat_action\", created.error.message);\n}`,
    "Chi'lly Chat spread trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor hidden in destructuring default",
    `${chatDomain}\nfunction __unsafeDefaultTrustMutation(created) {\n  const { Trusted: TrustedAlias = UserFacingError } = {};\n  throw new TrustedAlias(\"chat_action\", created.error.message);\n}`,
    "Chi'lly Chat default trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor hidden behind Object freeze",
    `${chatDomain}\nfunction __unsafeFrozenTrustMutation(created) {\n  const Holder = Object.freeze({ Trusted: UserFacingError });\n  throw new Holder.Trusted(\"chat_action\", created.error.message);\n}`,
    "Chi'lly Chat frozen trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor hidden behind Object assign",
    `${chatDomain}\nfunction __unsafeAssignedTrustMutation(created) {\n  const Holder = Object.assign({}, { Trusted: UserFacingError });\n  throw new Holder.Trusted(\"chat_action\", created.error.message);\n}`,
    "Chi'lly Chat Object.assign trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted constructor hidden behind bind",
    `${chatDomain}\nfunction __unsafeBoundTrustMutation(created) {\n  const TrustedAlias = UserFacingError.bind(null);\n  throw new TrustedAlias(\"chat_action\", created.error.message);\n}`,
    "Chi'lly Chat bound trust mutation",
    collectCustomerErrorBoundaryViolations,
  ],
  [
    "trusted picker guidance downgraded to Error",
    socialAttachmentPicker.replace("throw new UserFacingError(", "throw new Error("),
    "Social attachment picker mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded to Error call",
    socialAttachmentPicker.replace("throw new UserFacingError(", "throw Error("),
    "Social attachment picker call mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through Error constructor alias",
    `${socialAttachmentPicker}\nfunction __unsafePickerConstructorAlias(validationMessage) {\n  const PickerError = Error;\n  throw new PickerError(validationMessage);\n}`,
    "Social attachment picker constructor-alias mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through assigned Error alias",
    `${socialAttachmentPicker}\nfunction __unsafePickerAssignedAlias(validationMessage) {\n  let PickerError;\n  PickerError = Error;\n  throw PickerError(validationMessage);\n}`,
    "Social attachment picker assigned-alias mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through Error object member",
    `${socialAttachmentPicker}\nfunction __unsafePickerMemberAlias(validationMessage) {\n  const Constructors = { PickerError: Error };\n  throw new Constructors.PickerError(validationMessage);\n}`,
    "Social attachment picker member-alias mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through destructured Error member",
    `${socialAttachmentPicker}\nfunction __unsafePickerDestructuredAlias(validationMessage) {\n  const Constructors = { PickerError: Error };\n  const { PickerError } = Constructors;\n  throw new PickerError(validationMessage);\n}`,
    "Social attachment picker destructured-alias mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through assigned Error member",
    `${socialAttachmentPicker}\nfunction __unsafePickerAssignedMember(validationMessage) {\n  const Constructors = {};\n  Constructors.PickerError = Error;\n  throw Constructors.PickerError(validationMessage);\n}`,
    "Social attachment picker assigned-member mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through nested Error container",
    `${socialAttachmentPicker}\nfunction __unsafePickerNestedContainer(validationMessage) {\n  const Constructors = { Nested: [{ PickerError: Error }] };\n  throw new Constructors.Nested[0].PickerError(validationMessage);\n}`,
    "Social attachment picker nested-container mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through frozen Error container",
    `${socialAttachmentPicker}\nfunction __unsafePickerFrozenContainer(validationMessage) {\n  const Constructors = Object.freeze({ PickerError: Error });\n  throw new Constructors.PickerError(validationMessage);\n}`,
    "Social attachment picker frozen-container mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through assigned Error container",
    `${socialAttachmentPicker}\nfunction __unsafePickerObjectAssignContainer(validationMessage) {\n  const Constructors = Object.assign({}, { PickerError: Error });\n  throw Constructors.PickerError(validationMessage);\n}`,
    "Social attachment picker Object.assign mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through global object alias",
    `${socialAttachmentPicker}\nfunction __unsafePickerGlobalAlias(validationMessage) {\n  const Runtime = globalThis;\n  throw Runtime.Error(validationMessage);\n}`,
    "Social attachment picker global-alias mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through destructured global Error",
    `${socialAttachmentPicker}\nfunction __unsafePickerGlobalDestructure(validationMessage) {\n  const { Error: PickerError } = globalThis;\n  throw new PickerError(validationMessage);\n}`,
    "Social attachment picker global-destructure mutation",
    collectPlainThrownErrorViolations,
  ],
  [
    "trusted picker guidance downgraded through bound Error",
    `${socialAttachmentPicker}\nfunction __unsafePickerBoundError(validationMessage) {\n  const PickerError = Error.bind(null);\n  throw new PickerError(validationMessage);\n}`,
    "Social attachment picker bound-Error mutation",
    collectPlainThrownErrorViolations,
  ],
];

for (const [label, mutatedSource, mutatedFile, analyze] of boundaryMutationCases) {
  const originalSource = label.includes("picker") ? socialAttachmentPicker : label.includes("provider") ? chatDomain : login;
  if (mutatedSource === originalSource) {
    fail(`customer error-boundary mutation fixture did not apply: ${label}`);
    continue;
  }
  const violations = [
    ...analyze(mutatedSource, mutatedFile),
    ...(mutatedFile.startsWith("Chi'lly Chat")
      ? collectUserFacingErrorConstructionViolations(mutatedSource, mutatedFile)
      : []),
  ];
  if (violations.length === 0) {
    fail(`customer error-boundary proof accepted mutation: ${label}`);
  }
}

const safeSanitizerAliasSource = `${login}\nfunction __safeSanitizerAliasMutation(setError) {\n  try { throw new Error(\"provider detail\"); } catch (problem) {\n    const sanitize = getUserFacingErrorMessage;\n    setError(sanitize(problem, \"Unable to continue right now.\"));\n  }\n}`;
for (const violation of collectCustomerErrorBoundaryViolations(
  safeSanitizerAliasSource,
  "Safe sanitizer alias behavior",
)) {
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

const rootBoundary = read("components/system/root-error-boundary.tsx");
const rootLayout = read("app/_layout.tsx");
assertIncludes(rootBoundary, "errorName: error.name || \"Error\"", "root boundary analytics");
assertNotIncludes(rootBoundary, "defaultSummary={`Runtime issue: ${error.message}`}", "root boundary feedback summary");
assertNotIncludes(rootBoundary, "message: error.message", "root boundary analytics");
assertIncludes(rootLayout, "SENSITIVE_ROUTE_PARAM_NAMES.has(normalizedKey)", "auth redirect sensitive param filter");
assertIncludes(rootLayout, "normalizedKey.includes(\"token\")", "auth redirect token param filter");

const settings = read("app/settings.tsx");
const profile = read("app/profile/[userId].tsx");
const support = read("components/system/support-screen.tsx");
const copyrightReport = read("app/copyright-report.tsx");
const platformStudio = read("app/channel-settings.tsx");
const player = read("app/player/[id].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const liveEffectsSheet = read("components/live/live-effects-sheet.tsx");
const nativeAdSlot = read("components/ads/NativeAdSlot.tsx");
const communicationPreviewCard = read("components/communication/communication-preview-card.tsx");
const monetization = read("_lib/monetization.ts");
const premiumWatchPartyAccess = read("_lib/premiumWatchPartyAccess.ts");
const spectatorAccess = read("_lib/spectatorAccess.ts");
const mediaStorage = read("_lib/mediaStorage.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const liveKitTokenContract = read("_lib/livekit/token-contract.ts");
const legalPolicies = read("legal/policies.mjs");
const legalSiteBuild = read("public-site/legal-site/build.mjs");
const usernameHelper = read("_lib/usernameHandles.ts");

for (const [label, source] of [
  ["Settings", settings],
  ["Profile", profile],
  ["Support", support],
  ["Copyright report", copyrightReport],
  ["Platform Studio", platformStudio],
]) {
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
  ["Live effects sheet", liveEffectsSheet, [
    "CHI’LLYFECTS FOUNDATION",
    "does not process the outgoing camera track",
    "Real processing is still a later lane",
  ]],
  ["Live Stage", liveStage, [
    "LiveKit server unavailable",
    "LiveKit join unavailable",
    "No healthy LiveKit server heartbeat",
    "does not process the outgoing LiveKit camera track",
    "selectable as a foundation only",
  ]],
  ["Native ad slot", nativeAdSlot, [
    "Ad placeholder",
    "Native/feed placement foundation",
    "No real ad is loaded",
  ]],
  ["Chi'lly Chat call preview", communicationPreviewCard, [
    "development build",
    "debug build",
  ]],
  ["Player", player, [
    "provider proof",
    "This upload could not be loaded from storage",
    "does not process the outgoing LiveKit camera track",
  ]],
  ["Platform Studio creator copy", platformStudio, [
    "creator storage",
    "Percent progress is not backed",
    "backed metadata",
    "landed audience schema",
    "schema truth",
    "provider proof",
    "No money rows returned",
    "No digital sales rows yet",
    "No tips rows yet",
    "No Watch-Party seat rows yet",
    "No paid content rows yet",
    "No merch rows yet",
    "No payout rows yet",
    "No verified ledger rows yet",
    "ledger rows",
    "raw payloads",
    "not provider-backed",
    "not wired",
  ]],
  ["Premium copy", monetization, [
    "Premium proof is being rechecked",
    "RevenueCat proof is rechecked",
    "trusted entitlement truth",
  ]],
  ["Premium live copy", premiumWatchPartyAccess, [
    "temporarily open for proof",
  ]],
  ["Spectator copy", spectatorAccess, [
    "broadcast proof exists",
  ]],
  ["Media upload copy", mediaStorage, [
    "Media storage",
    "incomplete upload contract",
  ]],
  ["Creator video copy", creatorVideos, [
    "Creator storage",
    "Storage global and bucket limits",
    "Creator media storage",
  ]],
  ["LiveKit token copy", liveKitTokenContract, [
    "backend token endpoint",
    "token issuance failed",
    "LiveKit token requests require",
  ]],
];

for (const [label, source, forbiddenPhrases] of normalUserCopyChecks) {
  for (const phrase of forbiddenPhrases) {
    assertNotIncludes(source, phrase, `${label} normal-user technical copy`);
  }
}

for (const phrase of [
  "approved backend deletion",
  "magic instant wipe",
  "service-role credentials",
  "Profile, Channel",
  "channel display",
  "Channel setup",
  "public channel",
  "token request metadata",
  "Supabase",
]) {
  assertNotIncludes(legalPolicies, phrase, "Public legal policy normal-user technical copy");
}
assertIncludes(
  legalPolicies,
  "approved deletion or de-identification process",
  "Account deletion production copy",
);
assertIncludes(legalSiteBuild, "[\"channel\", \"Platform\"]", "Public DMCA Platform option label");
assertNotIncludes(
  legalSiteBuild,
  "Public DMCA form disabled: Supabase public URL or public anon key is not configured for this static build.",
  "Public DMCA unavailable copy",
);
assertNotIncludes(
  legalSiteBuild,
  "Attachment upload token was not returned for this case.",
  "Public DMCA attachment copy",
);

if (process.exitCode) process.exit(process.exitCode);

console.log("Critical UX polish policy guard passed.");
