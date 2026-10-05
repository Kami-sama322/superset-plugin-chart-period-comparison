/**
 * Jest-style globals (test/expect/describe) mapped onto node:test with a
 * practical subset of matchers for the standalone runner.
 */
import assert from "node:assert/strict";
import { test as nodeTest } from "node:test";

globalThis.test = (name, fn) =>
  nodeTest(name, async () => {
    await fn();
  });

globalThis.describe = (name, fn) => fn();

globalThis.beforeEach = () => {};

globalThis.expect = actual => ({
  toBe(expected) {
    assert.strictEqual(actual, expected);
  },
  toEqual(expected) {
    assert.deepStrictEqual(actual, expected);
  },
  toStrictEqual(expected) {
    assert.deepStrictEqual(actual, expected);
  },
  toBeNull() {
    assert.strictEqual(actual, null);
  },
  toBeUndefined() {
    assert.strictEqual(actual, undefined);
  },
  toBeDefined() {
    assert.notStrictEqual(actual, undefined);
  },
  toBeTruthy() {
    assert.ok(actual);
  },
  toBeFalsy() {
    assert.ok(!actual);
  },
  toBeCloseTo(expected, digits = 2) {
    const precision = Math.pow(10, -digits);
    assert.ok(
      Math.abs(actual - expected) < precision / 2,
      `expected ${actual} ≈ ${expected} (±${precision})`,
    );
  },
  toBeGreaterThan(expected) {
    assert.ok(actual > expected);
  },
  toBeGreaterThanOrEqual(expected) {
    assert.ok(actual >= expected);
  },
  toBeLessThan(expected) {
    assert.ok(actual < expected);
  },
  toBeLessThanOrEqual(expected) {
    assert.ok(actual <= expected);
  },
  toContain(expected) {
    if (typeof actual === "string") {
      assert.ok(
        actual.includes(expected),
        `expected "${actual}" to contain "${expected}"`,
      );
      return;
    }
    assert.ok(actual.includes(expected));
  },
  toHaveLength(expected) {
    assert.strictEqual(actual.length, expected);
  },
  toBeInstanceOf(expected) {
    assert.ok(actual instanceof expected);
  },
  toThrow(expected) {
    assert.throws(
      () => {
        if (typeof actual === "function") {
          actual();
        } else {
          assert.fail("expected a function");
        }
      },
      expected instanceof RegExp
        ? expected
        : typeof expected === "string"
          ? new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          : undefined,
    );
  },
  get not() {
    return {
      toBe: expected => assert.notStrictEqual(actual, expected),
      toEqual: expected => assert.notDeepStrictEqual(actual, expected),
      toContain: expected => {
        if (typeof actual === "string") {
          assert.ok(
            !actual.includes(expected),
            `expected "${actual}" not to contain "${expected}"`,
          );
          return;
        }
        assert.ok(!actual.includes(expected));
      },
      toHaveLength: expected => assert.notStrictEqual(actual.length, expected),
      toBeNull: () => assert.notStrictEqual(actual, null),
      toBeUndefined: () => assert.notStrictEqual(actual, undefined),
      toBeCloseTo: (expected, digits = 2) => {
        const precision = Math.pow(10, -digits);
        assert.ok(
          Math.abs(actual - expected) >= precision / 2,
          `expected ${actual} not to be ≈ ${expected}`,
        );
      },
    };
  },
});
