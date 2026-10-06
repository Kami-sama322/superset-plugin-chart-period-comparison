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
import {
  buildEmptyQuery,
  buildSpanQuery,
  GRAIN_TO_TIME_GRAIN,
  periodRangesSql,
} from "./queryPlan";

const periods = [
  { startMs: Date.UTC(2026, 0, 5), endMs: Date.UTC(2026, 0, 9, 23, 59, 59, 999) },
  { startMs: Date.UTC(2026, 1, 2), endMs: Date.UTC(2026, 1, 6, 23, 59, 59, 999) },
];

const baseInput = {
  baseFilters: [{ col: "region", op: "IN", val: ["EU"] }],
  periods,
  timeColumn: "ds",
  xAxisColumn: "ds",
  metricLabel: "SUM(revenue)",
  grain: "day" as const,
  rowLimit: 5000,
};

test("ONE query whose window is the OR-group of the period windows", () => {
  const queries = [buildSpanQuery(baseInput)];
  expect(queries).toHaveLength(1);
  const query = queries[0];
  expect(query.metrics).toEqual(["SUM(revenue)"]);
  expect(query.columns).toEqual(["ds"]);
  expect(query.is_timeseries).toBe(true);
  // only the base filter stays in `filters` — the period windows live in
  // extras.where, so the scan never covers the gap between the periods;
  // standalone the OR needs no extra outer group (the backend Grouping-
  // wraps the whole extras.where string itself)
  expect(query.filters).toEqual([{ col: "region", op: "IN", val: ["EU"] }]);
  expect(query.extras.where).toBe(
    "(ds >= '2026-01-05 00:00:00' AND ds < '2026-01-10 00:00:00') OR " +
      "(ds >= '2026-02-02 00:00:00' AND ds < '2026-02-07 00:00:00')",
  );
  // distant periods never widen each other's scan (2020 vs 2025 case)
  const far = periodRangesSql(
    [
      { startMs: Date.UTC(2020, 8, 1), endMs: Date.UTC(2020, 8, 5, 23, 59, 59, 999) },
      { startMs: Date.UTC(2025, 8, 6), endMs: Date.UTC(2025, 8, 10, 23, 59, 59, 999) },
    ],
    "day",
    "ts",
  );
  expect(far).toBe(
    "(ts >= '2020-09-01 00:00:00' AND ts < '2020-09-06 00:00:00') OR " +
      "(ts >= '2025-09-06 00:00:00' AND ts < '2025-09-11 00:00:00')",
  );
});

test("periodRangesSql: single period, grain snapping, empty fallback", () => {
  // a single period is one AND-safe parenthesized range
  expect(
    periodRangesSql(
      [{ startMs: Date.UTC(2020, 8, 1), endMs: Date.UTC(2020, 8, 5, 23, 59, 59, 999) }],
      "day",
      "ts",
    ),
  ).toBe("(ts >= '2020-09-01 00:00:00' AND ts < '2020-09-06 00:00:00')");
  // hour grain keeps the intra-day bounds; a partial last bucket
  // (17:30 end) extends to the next hour boundary, like the client split
  expect(
    periodRangesSql(
      [{ startMs: Date.UTC(2026, 0, 5, 12, 30), endMs: Date.UTC(2026, 0, 5, 17, 30) }],
      "hour",
      "ts",
    ),
  ).toBe("(ts >= '2026-01-05 12:00:00' AND ts < '2026-01-05 18:00:00')");
  // no periods cannot scan anything
  expect(periodRangesSql([], "day", "ts")).toBe("1 = 0");
});

test("the comparison grain maps to a Superset time grain", () => {
  const query = buildSpanQuery(baseInput);
  expect(query.time_grain_sqla).toBe("P1D");
  expect(query.extras.time_grain_sqla).toBe("P1D");
});

test("grain values cover hour/week/month/quarter/year", () => {
  expect(GRAIN_TO_TIME_GRAIN.hour).toBe("PT1H");
  expect(GRAIN_TO_TIME_GRAIN.week).toBe("1969-12-29T00:00:00Z/P1W");
  expect(GRAIN_TO_TIME_GRAIN.month).toBe("P1M");
  expect(GRAIN_TO_TIME_GRAIN.quarter).toBe("P3M");
  expect(GRAIN_TO_TIME_GRAIN.year).toBe("P1Y");
});

test("base filters, where and extras are shared, row limit is kept", () => {
  const query = buildSpanQuery({
    ...baseInput,
    baseExtras: { time_range: undefined, where: "(region = 'EU')" },
  });
  expect(query.row_limit).toBe(5000);
  // the base where is kept AND the multi-range OR is grouped to stay
  // below the ANDs
  expect(query.extras.where).toBe(
    "(region = 'EU') AND ((ds >= '2026-01-05 00:00:00' AND ds < '2026-01-10 00:00:00') OR " +
      "(ds >= '2026-02-02 00:00:00' AND ds < '2026-02-07 00:00:00'))",
  );
  expect(query.orderby).toBeUndefined();
  expect(query.series_columns).toEqual([]);
});

test("addWindowClause: false keeps the base where untouched (filter governs)", () => {
  const query = buildSpanQuery({
    ...baseInput,
    baseExtras: { where: "(region = 'EU')" },
    addWindowClause: false,
  });
  expect(query.extras.where).toBe("(region = 'EU')");
  expect(query.filters).toEqual([{ col: "region", op: "IN", val: ["EU"] }]);
});

test("hour grain maps to PT1H regardless of period length", () => {
  const query = buildSpanQuery({
    ...baseInput,
    grain: "hour",
  });
  expect(query.time_grain_sqla).toBe("PT1H");
});
