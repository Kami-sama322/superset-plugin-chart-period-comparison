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
import { getScale } from "./scale";
import { buildSeriesSetFromRows, rowTimestampMs } from "./seriesData";

const twoPeriods = [
  { startMs: Date.UTC(2026, 0, 5), endMs: Date.UTC(2026, 0, 9, 23, 59, 59, 999) },
  { startMs: Date.UTC(2026, 1, 2), endMs: Date.UTC(2026, 1, 6, 23, 59, 59, 999) },
];

const row = (month: number, day: number, value: number) => ({
  __timestamp: Date.UTC(2026, month, day),
  "SUM(revenue)": value,
});

test("ONE query's rows are distributed across the periods", () => {
  const series = buildSeriesSetFromRows({
    rows: [
      row(0, 5, 10), // Jan 5 — period 1, bucket 0
      row(0, 6, 20), // Jan 6 — period 1, bucket 1
      row(0, 9, 50), // Jan 9 — period 1, bucket 4
      row(1, 2, 30), // Feb 2 — period 2, bucket 0
    ],
    validated: twoPeriods,
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 5,
    scale: getScale("linear"),
    names: ["Jan", "Feb"],
    symbols: ["circle", "rect"],
    showSymbols: [true, true],
  });
  expect(series).toHaveLength(2);
  expect(series[0].values).toEqual([10, 20, null, null, 50]);
  expect(series[1].values).toEqual([30, null, null, null, null]);
  expect(series[0].hasData).toBe(true);
  // the empty second slice of period 1 stays null (gap, not zero)
  expect(series[1].rawValues).toEqual([30, null, null, null, null]);
});

test("values are transformed by the scale, raw values stay original", () => {
  const series = buildSeriesSetFromRows({
    rows: [row(0, 5, 9), row(0, 6, 100)],
    validated: [twoPeriods[0]],
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 5,
    scale: getScale("log"),
    names: ["s"],
    symbols: ["none"],
    showSymbols: [false],
  });
  expect(series[0].values[0]).toBeCloseTo(0.9542425094393488, 12);
  expect(series[0].values[1]).toBeCloseTo(2, 12);
  expect(series[0].rawValues[1]).toBe(100);
});

test("out-of-range and malformed rows are ignored", () => {
  const series = buildSeriesSetFromRows({
    rows: [
      { __timestamp: Date.UTC(2026, 0, 4), "SUM(revenue)": 1 },
      { __timestamp: Date.UTC(2026, 0, 10), "SUM(revenue)": 2 },
      { __timestamp: "garbage", "SUM(revenue)": 3 },
      { "SUM(revenue)": 4 },
      null,
    ],
    validated: [twoPeriods[0]],
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 5,
    scale: getScale("linear"),
    names: ["s"],
    symbols: ["none"],
    showSymbols: [false],
  });
  expect(series[0].values).toEqual([null, null, null, null, null]);
  expect(series[0].hasData).toBe(false);
});

test("ISO string timestamps and epoch seconds are understood", () => {
  const series = buildSeriesSetFromRows({
    rows: [
      { __timestamp: "2026-01-05T00:00:00", "SUM(revenue)": 7 },
      { __timestamp: Date.UTC(2026, 0, 6) / 1000, "SUM(revenue)": 8 },
    ],
    validated: [twoPeriods[0]],
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 5,
    scale: getScale("linear"),
    names: ["s"],
    symbols: ["none"],
    showSymbols: [false],
  });
  expect(series[0].values).toEqual([7, 8, null, null, null]);
});

test("bucket starts are padded with nulls beyond the own period", () => {
  const series = buildSeriesSetFromRows({
    rows: [],
    validated: [twoPeriods[0]],
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 7,
    scale: getScale("linear"),
    names: ["s"],
    symbols: ["none"],
    showSymbols: [false],
  });
  expect(series[0].bucketStarts).toHaveLength(7);
  expect(series[0].bucketStarts[5]).toBeNull();
  expect(series[0].bucketStarts[6]).toBeNull();
});

test("overlapping periods both receive the shared rows", () => {
  const overlap = [
    { startMs: Date.UTC(2026, 0, 5), endMs: Date.UTC(2026, 0, 12, 23, 59, 59, 999) },
    { startMs: Date.UTC(2026, 0, 7), endMs: Date.UTC(2026, 0, 14, 23, 59, 59, 999) },
  ];
  const series = buildSeriesSetFromRows({
    rows: [row(0, 6, 5), row(0, 9, 10), row(0, 13, 20)],
    validated: overlap,
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 10,
    scale: getScale("linear"),
    names: ["a", "b"],
    symbols: ["none", "none"],
    showSymbols: [false, false],
  });
  // Jan 6 is only in period 1 (idx 1), Jan 9 in BOTH (p1 idx 4, p2 idx 2),
  // Jan 13 only in period 2 (idx 6)
  expect(series[0].values[1]).toBe(5);
  expect(series[0].values[4]).toBe(10);
  expect(series[0].values[8]).toBeNull(); // Jan 13 is past period 1's end
  expect(series[1].values[2]).toBe(10);
  expect(series[1].values[6]).toBe(20);
});

test("rowTimestampMs falls back to the time column label", () => {
  expect(rowTimestampMs({ ds: "2026-01-05" }, "ds")).toBe(
    Date.UTC(2026, 0, 5),
  );
  expect(rowTimestampMs({ ds: Date.UTC(2026, 0, 5) }, "ds")).toBe(
    Date.UTC(2026, 0, 5),
  );
  expect(rowTimestampMs({})).toBeNull();
});
