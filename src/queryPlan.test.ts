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
import { buildPeriodQueries, GRAIN_TO_TIME_GRAIN } from "./queryPlan";

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

test("one query per period with its own TEMPORAL_RANGE filter", () => {
  const queries = buildPeriodQueries(baseInput);
  expect(queries).toHaveLength(2);
  queries.forEach((query, index) => {
    expect(query.metrics).toEqual(["SUM(revenue)"]);
    expect(query.columns).toEqual(["ds"]);
    expect(query.is_timeseries).toBe(true);
    expect(query.filters).toHaveLength(2);
    expect(query.filters[0]).toEqual({ col: "region", op: "IN", val: ["EU"] });
    expect(query.filters[1].col).toBe("ds");
    expect(query.filters[1].op).toBe("TEMPORAL_RANGE");
  });
  expect(queries[0].filters[1].val).toBe(
    "2026-01-05 00:00:00 : 2026-01-10 00:00:00",
  );
  expect(queries[1].filters[1].val).toBe(
    "2026-02-02 00:00:00 : 2026-02-07 00:00:00",
  );
});

test("the comparison grain maps to a Superset time grain on every query", () => {
  const queries = buildPeriodQueries(baseInput);
  queries.forEach(query => {
    expect(query.time_grain_sqla).toBe("P1D");
    expect(query.extras.time_grain_sqla).toBe("P1D");
  });
});

test("grain values cover hour/week/month/quarter/year", () => {
  expect(GRAIN_TO_TIME_GRAIN.hour).toBe("PT1H");
  expect(GRAIN_TO_TIME_GRAIN.week).toBe("1969-12-29T00:00:00Z/P1W");
  expect(GRAIN_TO_TIME_GRAIN.month).toBe("P1M");
  expect(GRAIN_TO_TIME_GRAIN.quarter).toBe("P3M");
  expect(GRAIN_TO_TIME_GRAIN.year).toBe("P1Y");
});

test("base filters and extras are shared, row limit is kept", () => {
  const queries = buildPeriodQueries({
    ...baseInput,
    baseExtras: { time_range: undefined },
  });
  expect(queries[0].row_limit).toBe(5000);
  expect(queries[0].extras).toEqual({ time_range: undefined, time_grain_sqla: "P1D" });
  expect(queries[0].orderby).toBeUndefined();
  expect(queries[0].series_columns).toEqual([]);
});

test("hour grain uses an exact exclusive upper bound", () => {
  const queries = buildPeriodQueries({
    ...baseInput,
    periods: [
      {
        startMs: Date.UTC(2026, 0, 5, 10, 30),
        endMs: Date.UTC(2026, 0, 5, 12, 15),
      },
    ],
    grain: "hour",
  });
  expect(queries[0].filters[1].val).toBe(
    "2026-01-05 10:30:00 : 2026-01-05 13:00:00",
  );
  expect(queries[0].time_grain_sqla).toBe("PT1H");
});
