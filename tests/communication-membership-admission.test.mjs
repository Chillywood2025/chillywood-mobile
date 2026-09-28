import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  fs.readFileSync("_lib/communicationMembershipAdmission.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const load = () => {
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports.reserveCommunicationMembershipAdmission;
};
const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };

test("membership admission: early release of queued owner cannot hide unresolved predecessor", async () => {
  const reserve = load();
  const first = reserve({ roomId: "room-a", userId: "user-a" });
  const second = reserve({ roomId: "ROOM-A", userId: "user-a" });
  second.release();
  await flush();
  const third = reserve({ roomId: "ROOM-A", userId: "user-a" });
  let ready = false;
  void third.predecessor.then(() => { ready = true; });
  await flush();
  assert.equal(ready, false);
  first.release();
  await third.predecessor;
  assert.equal(ready, true);
  third.release();
  await third.settled;
  await flush();
  const next = reserve({ roomId: "ROOM-A", userId: "user-a" });
  assert.equal(next.predecessor, null);
  next.release();
});

test("membership admission: distinct room or account does not borrow unresolved authority", async () => {
  const reserve = load();
  const blocked = reserve({ roomId: "ROOM-A", userId: "user-a" });
  const otherRoom = reserve({ roomId: "ROOM-B", userId: "user-a" });
  const otherAccount = reserve({ roomId: "ROOM-A", userId: "user-b" });
  assert.equal(otherRoom.predecessor, null);
  assert.equal(otherAccount.predecessor, null);
  otherRoom.release();
  otherRoom.release();
  otherAccount.release();
  await Promise.all([otherRoom.settled, otherAccount.settled]);
  blocked.release();
});
