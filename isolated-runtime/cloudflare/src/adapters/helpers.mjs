export const blocked = (databaseOperations, reason) =>
  Object.freeze({
    databaseOperations: Object.freeze(databaseOperations),
    ready: false,
    reason,
  });

export const ready = (databaseOperations, execute) =>
  Object.freeze({
    databaseOperations: Object.freeze(databaseOperations),
    execute,
    ready: true,
    reason: null,
  });
