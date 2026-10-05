/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { getScale, SCALES } from "./scale";

test("linear scale is the identity", () => {
  expect(SCALES.linear.apply(42)).toBe(42);
  expect(SCALES.linear.invert(42)).toBe(42);
  expect(SCALES.linear.apply(null)).toBeNull();
});

test("sqrt scale rejects negatives and round-trips", () => {
  expect(SCALES.sqrt.apply(9)).toBe(3);
  expect(SCALES.sqrt.apply(0)).toBe(0);
  expect(SCALES.sqrt.apply(-1)).toBeNull();
  expect(SCALES.sqrt.invert(3)).toBe(9);
  expect(SCALES.sqrt.invert(null)).toBeNull();
  expect(SCALES.sqrt.invert(SCALES.sqrt.apply(17))).toBeCloseTo(17, 10);
});

test("log scale rejects non-positive values and round-trips", () => {
  expect(SCALES.log.apply(1000)).toBeCloseTo(3, 12);
  expect(SCALES.log.apply(0)).toBeNull();
  expect(SCALES.log.apply(-5)).toBeNull();
  expect(SCALES.log.invert(3)).toBeCloseTo(1000, 8);
  expect(SCALES.log.invert(SCALES.log.apply(7))).toBeCloseTo(7, 12);
});

test("power2 scale squares values and inverts with sqrt", () => {
  expect(SCALES.power2.apply(5)).toBe(25);
  expect(SCALES.power2.invert(25)).toBe(5);
  expect(SCALES.power2.invert(-3)).toBeNull();
  expect(SCALES.power2.invert(SCALES.power2.apply(9))).toBeCloseTo(9, 12);
});

test("getScale falls back to linear", () => {
  expect(getScale(undefined).id).toBe("linear");
  expect(getScale(null).id).toBe("linear");
  expect(getScale("log").id).toBe("log");
});
