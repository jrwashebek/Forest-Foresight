// UI helpers that carry rules the QA checks: unique player initials (QA N5) and short names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { playerTokens, firstNames } from "../src/ui/util.js";

test("initials are unique and short (Maria Lopez / Mark Lee)", () => {
  const t = playerTokens(["Ana Ruiz", "Ben Okafor", "Chen Wu", "Maria Lopez", "Mark Lee", "Eli Begay", "Fay Thompson"]);
  assert.deepEqual(t, ["AR", "BO", "CW", "MLo", "MLe", "EB", "FT"]);
  assert.equal(new Set(t).size, t.length);
});

test("single names, identical names and long collisions stay unique and ≤ 4 letters", () => {
  for (const names of [["Maria", "Mark", "Ana"], ["Ana Ruiz", "Ana Ruiz", "Ben"], ["Mary Ann Smith", "Mark Smith"], ["Sam Lee", "Sam Lee-Park", "Sara Lee"], ["Ana", "Ben", "Chen", "Dee", "Eli", "Fay", "Gus"]]) {
    const t = playerTokens(names);
    assert.equal(new Set(t.map((x) => x.toUpperCase())).size, names.length, names.join(", ") + " → " + t.join(" "));
    for (const x of t) assert.ok(x.length <= 4, x);
  }
  assert.deepEqual(playerTokens(["Maria", "Mark"]), ["Mari", "Mark"]);
});

test("first names, full names only where first names repeat", () => {
  assert.deepEqual(firstNames(["Maria Lopez", "Mark Lee", "Ana Ruiz", "Ana Smith"]), ["Maria", "Mark", "Ana Ruiz", "Ana Smith"]);
});
