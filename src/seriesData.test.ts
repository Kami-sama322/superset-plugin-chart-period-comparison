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
import { buildSeries, rowTimestampMs } from "./seriesData";

const period = {
  startMs: Date.UTC(2026, 0, 5),
  endMs: Date.UTC(2026, 0, 9, 23, 59, 59, 999),
};

const row = (day: number, value: number) => ({
  __timestamp: Date.UTC(2026, 0, day),
  "SUM(revenue)": value,
});

test("rows are placed on the relative axis by their bucket index", () => {
  const series = buildSeries({
    rows: [row(5, 10), row(6, 20), row(9, 50)],
    period,
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 5,
    scale: getScale("linear"),
    name: "05.01–09.01.2026",
    symbol: "circle",
  });
  expect(series.values).toEqual([10, 20, null, null, 50]);
  expect(series.rawValues).toEqual([10, 20, null, null, 50]);
  expect(series.hasData).toBe(true);
  expect(series.bucketStarts).toHaveLength(5);
  expect(series.bucketStarts[0]).toBe(Date.UTC(2026, 0, 5));
  expect(series.bucketStarts[4]).toBe(Date.UTC(2026, 0, 9));
});

test("values are transformed by the scale, raw values stay original", () => {
  const series = buildSeries({
    rows: [row(5, 9), row(6, 100)],
    period,
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 5,
    scale: getScale("log"),
    name: "s",
    symbol: "none",
  });
  expect(series.values[0]).toBeCloseTo(0.9542425094393488, 12);
  expect(series.values[1]).toBeCloseTo(2, 12);
  expect(series.values[2]).toBeNull();
  expect(series.rawValues[1]).toBe(100);
});

test("out-of-range and malformed rows are ignored", () => {
  const series = buildSeries({
    rows: [
      { __timestamp: Date.UTC(2026, 0, 4), "SUM(revenue)": 1 },
      { __timestamp: Date.UTC(2026, 0, 10), "SUM(revenue)": 2 },
      { __timestamp: "garbage", "SUM(revenue)": 3 },
      { "SUM(revenue)": 4 },
      null,
    ],
    period,
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 5,
    scale: getScale("linear"),
    name: "s",
    symbol: "none",
  });
  expect(series.values).toEqual([null, null, null, null, null]);
  expect(series.hasData).toBe(false);
});

test("ISO string timestamps and epoch seconds are understood", () => {
  const series = buildSeries({
    rows: [
      { __timestamp: "2026-01-05T00:00:00", "SUM(revenue)": 7 },
      { __timestamp: Date.UTC(2026, 0, 6) / 1000, "SUM(revenue)": 8 },
    ],
    period,
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 5,
    scale: getScale("linear"),
    name: "s",
    symbol: "none",
  });
  expect(series.values).toEqual([7, 8, null, null, null]);
});

test("bucket starts are padded with nulls beyond the own period", () => {
  const series = buildSeries({
    rows: [],
    period,
    grain: "day",
    metricLabel: "SUM(revenue)",
    axisLength: 7,
    scale: getScale("linear"),
    name: "s",
    symbol: "none",
  });
  expect(series.bucketStarts).toHaveLength(7);
  expect(series.bucketStarts[5]).toBeNull();
  expect(series.bucketStarts[6]).toBeNull();
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
