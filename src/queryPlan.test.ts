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
import { buildEmptyQuery, buildSpanQuery, GRAIN_TO_TIME_GRAIN } from "./queryPlan";

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

test("ONE query over the union span with a single TEMPORAL_RANGE filter", () => {
  const queries = [buildSpanQuery(baseInput)];
  expect(queries).toHaveLength(1);
  const query = queries[0];
  expect(query.metrics).toEqual(["SUM(revenue)"]);
  expect(query.columns).toEqual(["ds"]);
  expect(query.is_timeseries).toBe(true);
  // base filter + the span clause — no per-period pairs in WHERE
  expect(query.filters).toHaveLength(2);
  expect(query.filters[0]).toEqual({ col: "region", op: "IN", val: ["EU"] });
  expect(query.filters[1]).toEqual({
    col: "ds",
    op: "TEMPORAL_RANGE",
    val: "2026-01-05 00:00:00 : 2026-02-07 00:00:00",
  });
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

test("base filters and extras are shared, row limit is kept", () => {
  const query = buildSpanQuery({
    ...baseInput,
    baseExtras: { time_range: undefined },
  });
  expect(query.row_limit).toBe(5000);
  expect(query.extras).toEqual({ time_range: undefined, time_grain_sqla: "P1D" });
  expect(query.orderby).toBeUndefined();
  expect(query.series_columns).toEqual([]);
});

test("hour grain maps to PT1H regardless of period length", () => {
  const query = buildSpanQuery({
    ...baseInput,
    grain: "hour",
  });
  expect(query.time_grain_sqla).toBe("PT1H");
});
