class TransactionLock {
  #tail = Promise.resolve();

  async runExclusive(operation) {
    const previous = this.#tail;
    let release;
    this.#tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class ControlledBarrier {
  constructor(ids) {
    this.gates = new Map();
    this.completed = new Map();
    for (const id of ids) {
      let release;
      let finish;
      this.gates.set(id, { promise: new Promise((resolve) => { release = resolve; }), release });
      this.completed.set(id, { promise: new Promise((resolve) => { finish = resolve; }), finish });
    }
  }

  wait(id) { return this.gates.get(id).promise; }
  release(id) { this.gates.get(id).release(); }
  finish(id) { this.completed.get(id).finish(); }
  done(id) { return this.completed.get(id).promise; }
}

async function execute(initial, operations, order) {
  let state = structuredClone(initial);
  const lock = new TransactionLock();
  const barrier = new ControlledBarrier(Object.keys(operations));
  const tasks = Object.entries(operations).map(async ([id, operation]) => {
    await barrier.wait(id);
    await lock.runExclusive(() => { state = operation(structuredClone(state)); });
    barrier.finish(id);
  });
  for (const id of order) {
    barrier.release(id);
    await barrier.done(id);
  }
  await Promise.all(tasks);
  return state;
}

const resolveOnce = (outcome) => (state) => {
  if (state.outcome === "pending") {
    state.outcome = outcome;
    state.resolutionCount += 1;
  }
  return state;
};

const exactSchedule = (expectedBySchedule) => ({
  expectedBySchedule,
  safe: (state, order) => JSON.stringify(state) === JSON.stringify(expectedBySchedule[order.join(" -> ")])
});

const applyAuthoritative = (event) => (state) => {
  if (event.time < state.authoritativeTime) return state;
  state.authoritativeTime = event.time;
  state.owner = event.owner ?? state.owner;
  state.access = event.access;
  return state;
};

const retainThenConsume = (readyKey) => ({
  receive: (state) => {
    state.received = true;
    state.pending = true;
    if (state[readyKey]) {
      state.pending = false;
      state.consumed = true;
    }
    return state;
  },
  ready: (state) => {
    state[readyKey] = true;
    if (state.pending) {
      state.pending = false;
      state.consumed = true;
    }
    return state;
  }
});

const scenarios = [
  {
    id: "accept-versus-timeout",
    initial: { outcome: "pending", resolutionCount: 0 },
    operations: { accept: resolveOnce("accepted"), timeout: resolveOnce("timed_out") },
    ...exactSchedule({
      "accept -> timeout": { outcome: "accepted", resolutionCount: 1 },
      "timeout -> accept": { outcome: "timed_out", resolutionCount: 1 }
    })
  },
  {
    id: "accept-versus-cancel",
    initial: { outcome: "pending", resolutionCount: 0 },
    operations: { accept: resolveOnce("accepted"), cancel: resolveOnce("cancelled") },
    ...exactSchedule({
      "accept -> cancel": { outcome: "accepted", resolutionCount: 1 },
      "cancel -> accept": { outcome: "cancelled", resolutionCount: 1 }
    })
  },
  {
    id: "old-cleanup-versus-new-invite",
    initial: { generation: 1, threadRoom: null },
    operations: {
      old_cleanup: (s) => { if (s.generation === 1) s.threadRoom = null; return s; },
      new_invite: (s) => { s.generation = 2; s.threadRoom = "room-2"; return s; }
    },
    safe: (s) => s.generation === 2 && s.threadRoom === "room-2"
  },
  {
    id: "end-versus-membership-update",
    initial: { ended: false, membership: "active" },
    operations: {
      end: (s) => { s.ended = true; s.membership = "ended"; return s; },
      membership_update: (s) => { if (!s.ended) s.membership = "reconnecting"; return s; }
    },
    safe: (s) => s.ended && s.membership === "ended"
  },
  {
    id: "revenuecat-renewal-versus-transfer",
    initial: { authoritativeTime: 0, owner: "source", access: true },
    operations: {
      renewal: applyAuthoritative({ time: 10, owner: "source", access: true }),
      transfer: applyAuthoritative({ time: 20, owner: "target", access: true })
    },
    safe: (s) => s.owner === "target" && s.access
  },
  {
    id: "revenuecat-expiration-versus-delayed-renewal",
    initial: { authoritativeTime: 0, owner: "source", access: true },
    operations: {
      expiration: applyAuthoritative({ time: 20, access: false }),
      delayed_renewal: applyAuthoritative({ time: 10, owner: "source", access: true })
    },
    safe: (s) => s.authoritativeTime === 20 && !s.access
  },
  {
    id: "push-receipt-versus-session-boot",
    initial: { sessionReady: false, received: false, pending: false, consumed: false },
    operations: (() => {
      const pair = retainThenConsume("sessionReady");
      return { push_receipt: pair.receive, session_boot: pair.ready };
    })(),
    safe: (s) => s.received && s.consumed && !s.pending
  },
  {
    id: "native-answer-versus-react-initialization",
    initial: { reactReady: false, received: false, pending: false, consumed: false },
    operations: (() => {
      const pair = retainThenConsume("reactReady");
      return { native_answer: pair.receive, react_initialization: pair.ready };
    })(),
    safe: (s) => s.received && s.consumed && !s.pending
  },
  {
    id: "update-activation-versus-rollback",
    initial: { active: "embedded", compatible: true, activationEnabled: true, activationAttempts: 0, activations: 0, rollbacks: 0 },
    operations: {
      activate: (s) => {
        s.activationAttempts += 1;
        if (s.compatible && s.activationEnabled) {
          s.active = "update";
          s.activations += 1;
        }
        return s;
      },
      rollback: (s) => {
        s.active = "embedded";
        s.activationEnabled = false;
        s.rollbacks += 1;
        return s;
      }
    },
    ...exactSchedule({
      "activate -> rollback": { active: "embedded", compatible: true, activationEnabled: false, activationAttempts: 1, activations: 1, rollbacks: 1 },
      "rollback -> activate": { active: "embedded", compatible: true, activationEnabled: false, activationAttempts: 1, activations: 0, rollbacks: 1 }
    })
  },
  {
    id: "emergency-stop-versus-mutation",
    initial: { stopped: false, mutations: 0, deniedMutations: 0 },
    operations: {
      emergency_stop: (s) => { s.stopped = true; return s; },
      mutation: (s) => {
        if (s.stopped) s.deniedMutations += 1;
        else s.mutations += 1;
        return s;
      }
    },
    ...exactSchedule({
      "emergency_stop -> mutation": { stopped: true, mutations: 0, deniedMutations: 1 },
      "mutation -> emergency_stop": { stopped: true, mutations: 1, deniedMutations: 0 }
    })
  }
];

export async function runDeterministicInterleavings() {
  const results = [];
  for (const scenario of scenarios) {
    const ids = Object.keys(scenario.operations);
    for (const order of [ids, [...ids].reverse()]) {
      const state = await execute(scenario.initial, scenario.operations, order);
      const schedule = order.join(" -> ");
      results.push({
        scenario: scenario.id,
        schedule,
        status: scenario.safe(state, order) ? "MODEL_CLEAR" : "BLOCKED_INTERNAL",
        expectedState: scenario.expectedBySchedule?.[schedule] ?? null,
        finalState: state
      });
    }
  }
  return {
    ok: results.every(({ status }) => status === "MODEL_CLEAR"),
    status: results.every(({ status }) => status === "MODEL_CLEAR") ? "MODEL_CLEAR" : "BLOCKED_INTERNAL",
    scenarioCount: scenarios.length,
    scheduleCount: results.length,
    mechanism: ["controlled barriers", "promises", "transaction lock", "explicit schedules"],
    results
  };
}
