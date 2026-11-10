// Per-isolate allocation admission, shared across request factories. This is a
// memory bound, not account capacity proof, authorization, or a retry permit.
export function createR2IsolateAdmission({ responseDeadlineMs = 5000 } = {}) {
  if (!Number.isInteger(responseDeadlineMs) || responseDeadlineMs < 1 || responseDeadlineMs > 5000) throw Error('admission_deadline_invalid');
  let used = 0;
  return Object.freeze({ async run(request, execute, unavailable) {
    let operation;
    try { operation = JSON.parse(request.headers.get('x-chillywood-r2-token')).operation; } catch { /* Malformed requests use the full budget. */ }
    // The gateway verifies the signed operation before any body read. A forged
    // range classification can never execute a full-body operation.
    const units = request.method === 'GET' && operation === 'range' ? 1 : 4;
    if (used + units > 4) return unavailable();
    used += units;
    let complete = false, pending = 0, released = false;
    const release = () => { if (complete && pending === 0 && !released) { released = true; used -= units; } };
    const hold = () => { pending++; let settled = false; return () => { if (!settled) { settled = true; pending--; release(); } }; };
    const track = promise => { const finish = hold(), value = Promise.resolve(promise); value.then(finish, finish); return value; };
    const finishResponse = () => { complete = true; release(); };
    const wrapStream = (body, finish, deadline) => {
      const reader = body.getReader(); let ended = false, cancelling = false, cancellation, controller, timer;
      const done = () => { if (!ended) { ended = true; clearTimeout(timer); try { reader.releaseLock(); } catch { /* Pending source read. */ } finish(); } };
      const cancel = reason => {
        // Do not free the allocation while cancellation itself is unresolved.
        if (ended) return Promise.resolve();
        if (cancellation) return cancellation;
        cancelling = true;
        let value; try { value = reader.cancel(reason); } catch (error) { value = Promise.reject(error); }
        // Failed cancellation is not proof that retained buffers were released.
        // Keep this permit poisoned until the isolate itself is discarded.
        cancellation = Promise.resolve(value).then(done);
        return cancellation;
      };
      const stream = new ReadableStream({ start(value) { controller = value; }, async pull(value) {
        try { const next = await reader.read(); if (ended || cancelling) return; if (next.done) { value.close(); done(); } else value.enqueue(next.value); }
        catch (error) { if (!ended && !cancelling) { value.error(error); done(); } }
      }, cancel }, { highWaterMark: 0 });
      if (deadline) timer = setTimeout(() => {
        if (ended) return;
        controller.error(new Error('paid_video_r2_response_deadline'));
        void cancel('response deadline').catch(() => {});
      }, responseDeadlineMs);
      return stream;
    };
    const lease = Object.freeze({ track, body: body => wrapStream(body, hold(), false),
      read(promise) { return track(Promise.resolve(promise).then(value => {
        if (!value?.body) return value;
        // Preserve the native metadata methods/prototype, replacing only body.
        const body = wrapStream(value.body, hold(), false);
        return new Proxy(value, { get(target, key) {
          if (key === 'body') return body;
          const member = Reflect.get(target, key, target);
          return typeof member === 'function' ? member.bind(target) : member;
        } });
      })); },
    });
    try {
      const response = await execute(lease);
      if (!(response instanceof Response)) throw Error('admission_response_invalid');
      if (!response.body) { finishResponse(); return response; }
      return new Response(wrapStream(response.body, finishResponse, true), {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    } catch (error) { finishResponse(); throw error; }
  } });
}

// Module scope is essential: a new runtime/config factory cannot reset this.
export const r2IsolateAdmission = createR2IsolateAdmission();
