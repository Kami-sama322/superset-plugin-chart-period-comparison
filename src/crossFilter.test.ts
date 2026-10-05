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
import { buildPeriodsDataMask } from "./crossFilter";

const periods = [
  { start: "2026-01-05", end: "2026-01-09" },
  { start: "2026-02-02", end: "2026-02-06" },
];

test("a valid set emits the span TEMPORAL_RANGE and ownState", () => {
  const mask = buildPeriodsDataMask(periods, "ds");
  expect(mask.ownState.periods).toEqual(periods);
  expect(mask.extraFormData.filters).toEqual([
    {
      col: "ds",
      op: "TEMPORAL_RANGE",
      val: "2026-01-05 00:00:00 : 2026-02-07 00:00:00",
    },
  ]);
  expect(mask.filterState.value).toBe(
    "2026-01-05 00:00:00 : 2026-02-07 00:00:00",
  );
  expect(mask.filterState.label).toContain("05.01");
});

test("an invalid set clears the cross-filter but keeps the picker state", () => {
  const mask = buildPeriodsDataMask(
    [
      { start: "2026-01-05", end: "2026-01-09" },
      { start: "2026-02-02", end: "2026-02-08" }, // unequal length
    ],
    "ds",
  );
  expect(mask.extraFormData.filters).toEqual([]);
  expect(mask.filterState.value).toBeNull();
  expect(mask.ownState.periods).toHaveLength(2);
});

test("no time column means no cross-filter clause", () => {
  const mask = buildPeriodsDataMask(periods, undefined);
  expect(mask.extraFormData.filters).toEqual([]);
});

test("an empty list clears everything", () => {
  const mask = buildPeriodsDataMask([], "ds");
  expect(mask.ownState.periods).toEqual([]);
  expect(mask.extraFormData.filters).toEqual([]);
  expect(mask.filterState.value).toBeNull();
});
