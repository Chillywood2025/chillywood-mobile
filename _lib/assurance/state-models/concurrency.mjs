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
    safe: (s) => s.resolutionCount === 1
  },
  {
    id: "accept-versus-cancel",
    initial: { outcome: "pending", resolutionCount: 0 },
    operations: { accept: resolveOnce("accepted"), cancel: resolveOnce("cancelled") },
    safe: (s) => s.resolutionCount === 1
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
    initial: { active: "embedded", compatible: true },
    operations: {
      activate: (s) => { if (s.compatible) s.active = "update"; return s; },
      rollback: (s) => { s.active = "embedded"; return s; }
    },
    safe: (s) => s.compatible && ["embedded", "update"].includes(s.active)
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
    safe: (s) => s.stopped && s.mutations <= 1 && s.deniedMutations <= 1
  }
];

export async function runDeterministicInterleavings() {
  const results = [];
  for (const scenario of scenarios) {
    const ids = Object.keys(scenario.operations);
    for (const order of [ids, [...ids].reverse()]) {
      const state = await execute(scenario.initial, scenario.operations, order);
      results.push({
        scenario: scenario.id,
        schedule: order.join(" -> "),
        status: scenario.safe(state) ? "MODEL_CLEAR" : "BLOCKED_INTERNAL",
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
