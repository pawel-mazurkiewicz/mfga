import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { restoreTypenames } from "../../../src/data/typenames.js";
import { createClassifier } from "../../../src/data/classify.js";
import { health } from "../../../src/shared/util.js";
import { ENV, OBFUSCATED } from "../../fixtures/gql/make-fixtures.mjs";
import { edgesOf, readJson } from "./helpers.mjs";

describe("restoreTypenames", () => {
  test("replaces obfuscated __typename values anywhere in objects and arrays, in place", () => {
    const root = { __typename: "AAA", list: [{ __typename: "BBB", inner: [[{ __typename: "AAA" }]] }], keep: { __typename: "Story" } };
    const out = restoreTypenames(root, [
      ["AAA", "SponsoredData"],
      ["BBB", "AdsSideFeedUnit"],
    ]);
    assert.equal(out, root);
    assert.deepEqual(root, { __typename: "SponsoredData", list: [{ __typename: "AdsSideFeedUnit", inner: [[{ __typename: "SponsoredData" }]] }], keep: { __typename: "Story" } });
  });

  test("only __typename values change, never other keys holding the same string", () => {
    const root = { __typename: "AAA", name: "AAA", __isNode: "AAA" };
    restoreTypenames(root, [["AAA", "Real"]]);
    assert.deepEqual(root, { __typename: "Real", name: "AAA", __isNode: "AAA" });
  });

  test("each value is restored once (pairs are a table, not a chain)", () => {
    const root = { a: { __typename: "A" }, b: { __typename: "B" } };
    restoreTypenames(root, [
      ["A", "B"],
      ["B", "C"],
    ]);
    assert.deepEqual(root, { a: { __typename: "B" }, b: { __typename: "C" } });
  });

  test("malformed pair lists are ignored", () => {
    const root = { __typename: "AAA" };
    for (const pairs of [null, undefined, "x", {}, [], [["AAA"]], [["AAA", 1]], [[1, "x"]], ["AAA", "Real"], [["AAA", "Real", "extra"]]]) {
      restoreTypenames(root, pairs);
      assert.equal(root.__typename, "AAA", JSON.stringify(pairs));
    }
  });

  test("non-object roots are returned untouched", () => {
    assert.equal(restoreTypenames(null, [["a", "b"]]), null);
    assert.equal(restoreTypenames("AAA", [["AAA", "b"]]), "AAA");
    assert.equal(restoreTypenames(5, [["a", "b"]]), 5);
  });

  test("counts restored typenames for the health panel", () => {
    const before = health.counters["typenames.restored"] ?? 0;
    restoreTypenames([{ __typename: "Z1" }, { __typename: "Z1" }], [["Z1", "Story"]]);
    assert.equal(health.counters["typenames.restored"], before + 2);
  });

  test("obfuscated ad typenames are only caught after the Env.q9k7m2x restore", async () => {
    const env = readJson("obfuscated-typename.env.json");
    assert.deepEqual(env, ENV);
    const { classify } = createClassifier();
    const raw = edgesOf("obfuscated-typename.jsonl");
    assert.equal(raw[1].node.__typename, OBFUSCATED.adsUnit);
    assert.deepEqual(
      (await Promise.all(raw.map(classify))).map((v) => v.reason),
      ["keep", `unit:${OBFUSCATED.adsUnit}`],
      "without the table the sponsored data hides under a random typename",
    );
    const restored = edgesOf("obfuscated-typename.jsonl").map((e) => restoreTypenames(e, env.q9k7m2x));
    assert.deepEqual(
      (await Promise.all(restored.map(classify))).map((v) => v.reason),
      ["sponsored-data", "unit:AdsSideFeedUnit"],
    );
  });
});
