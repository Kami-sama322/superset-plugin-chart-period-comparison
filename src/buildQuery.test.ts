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
import buildQuery from "./buildQuery";
import type { PeriodComparisonQueryFormData } from "./types";

function formData(
  overrides: Partial<PeriodComparisonQueryFormData> = {},
): PeriodComparisonQueryFormData {
  return {
    datasource: "5__table",
    vizType: "chart_period_comparison",
    metric: "revenue",
    x_axis: "ds",
    comparison_grain: "day",
    periods: [
      { start: "2026-01-05", end: "2026-01-09" },
      { start: "2026-02-02", end: "2026-02-06" },
    ],
    ...overrides,
  } as PeriodComparisonQueryFormData;
}

test("builds one query per period with TEMPORAL_RANGE filters", () => {
  const context = buildQuery(formData());
  expect(context.queries).toHaveLength(2);
  context.queries.forEach(query => {
    expect(query.metrics).toEqual(["revenue"]);
    expect(query.is_timeseries).toBe(true);
    expect(query.time_grain_sqla).toBe("P1D");
    expect(query.filters?.[query.filters.length - 1]).toEqual({
      col: "ds",
      op: "TEMPORAL_RANGE",
      val: expect.stringContaining(" : "),
    });
  });
  expect(context.queries[0].filters?.at(-1)?.val).toBe(
    "2026-01-05 00:00:00 : 2026-01-10 00:00:00",
  );
  expect(context.queries[1].filters?.at(-1)?.val).toBe(
    "2026-02-02 00:00:00 : 2026-02-07 00:00:00",
  );
});

test("dashboard extra filters are shared across all period queries", () => {
  const context = buildQuery(
    formData({
      extra_form_data: {
        filters: [{ col: "region", op: "IN", val: ["EU"] }],
      },
    }) as never,
  );
  context.queries.forEach(query => {
    expect(query.filters?.[0]).toEqual({ col: "region", op: "IN", val: ["EU"] });
    expect(query.filters).toHaveLength(2);
  });
});

test("ownState periods override the control-panel value", () => {
  const context = buildQuery(formData(), {
    ownState: {
      periods: [{ start: "2026-03-02", end: "2026-03-06" }],
    },
  });
  expect(context.queries).toHaveLength(1);
  expect(context.queries[0].filters?.at(-1)?.val).toBe(
    "2026-03-02 00:00:00 : 2026-03-07 00:00:00",
  );
});

test("a date filter with no structured periods and no config periods yields an always-empty query", () => {
  const context = buildQuery({
    ...formData(),
    periods: [],
    extra_form_data: {
      custom_form_data: [{ col: "events_dt" }], // presence marker only
    },
  } as never);
  expect(context.queries).toHaveLength(1);
  expect(context.queries[0].adhoc_filters).toEqual([
    { clause: "WHERE", expressionType: "SQL", sqlExpression: "1 = 0" },
  ]);
  expect(context.queries[0].filters).toEqual([]);
});

test("a calendar-style date filter keeps the configured periods and narrows them", () => {
  const context = buildQuery({
    ...formData(),
    extra_form_data: {
      filters: [{ col: "ds", op: ">=", val: "2026-01-06" }],
    },
  } as never);
  // config periods still drive the chart (two queries)
  expect(context.queries).toHaveLength(2);
  context.queries.forEach(query => {
    expect(query.filters?.at(-1)?.val).toBeDefined();
    // the calendar's simple clause survives in the base filters
    expect(query.filters?.some(f => f.col === "ds" && f.op === ">=")).toBe(true);
  });
});

test("filter periods from extra_form_data.custom_form_data drive the queries", () => {
  const context = buildQuery({
    ...formData(),
    extra_form_data: {
      custom_form_data: [
        { col: "events_dt", start: "2026-06-01T00:00:00.000Z", end: "2026-06-05T23:59:59.999Z" },
      ],
    },
  } as never);
  expect(context.queries).toHaveLength(1);
  expect(context.queries[0].filters?.at(-1)?.val).toBe(
    "2026-06-01 00:00:00 : 2026-06-06 00:00:00",
  );
});

test("tagged date-filter clauses (foreign and own) are stripped from the base", () => {
  const foreignTagged = {
    clause: "WHERE",
    expressionType: "SQL",
    sqlExpression: "/* period_ranges:v1 */ (events_dt >= '2026-06-01')",
  };
  const ownSpan = {
    clause: "WHERE",
    expressionType: "SQL",
    sqlExpression: "/* period_comparison:own:v1 */ (events_dt >= '2026-01-01')",
  };
  const regularAdhoc = {
    clause: "WHERE",
    expressionType: "SQL",
    sqlExpression: "region IN ('EU')",
  };
  const context = buildQuery({
    ...formData(),
    extra_form_data: {
      adhoc_filters: [foreignTagged, ownSpan, regularAdhoc],
      custom_form_data: [
        { col: "events_dt", start: "2026-06-01T00:00:00.000Z", end: "2026-06-05T23:59:59.999Z" },
      ],
    },
  } as never);
  context.queries.forEach(query => {
    // neither the foreign filter clause nor the chart's own span may
    // AND-narrow the per-period ranges built from the structured channel
    const adhoc = query.adhoc_filters as { sqlExpression?: string }[] | undefined;
    expect(adhoc?.some(f => f.sqlExpression?.startsWith("/* period"))).toBe(false);
    expect(adhoc?.some(f => f.sqlExpression === "region IN ('EU')")).toBe(true);
    expect(query.filters?.some(f => f.col === "events_dt")).toBe(false);
  });
});

test("throws without a metric or a time column", () => {
  expect(() => buildQuery(formData({ metric: undefined }))).toThrow(
    "Select a metric",
  );
  expect(() => buildQuery(formData({ x_axis: undefined }))).toThrow(
    "Select a time column",
  );
});

test("throws without valid periods", () => {
  expect(() => buildQuery(formData({ periods: [] }))).toThrow(
    "Add at least one valid period",
  );
  expect(() =>
    buildQuery(
      formData({
        periods: [
          { start: "2026-01-05", end: "2026-01-09" },
          { start: "2026-02-02", end: "2026-02-08" },
        ],
      }),
    ),
  ).toThrow("same length");
});

test("grain controls the time grain of every query", () => {
  const context = buildQuery(
    formData({ comparison_grain: "week" }) as never,
  );
  context.queries.forEach(query => {
    expect(query.time_grain_sqla).toBe("1969-12-29T00:00:00Z/P1W");
    expect(query.extras?.time_grain_sqla).toBe("1969-12-29T00:00:00Z/P1W");
  });
});

test("row_limit and adhoc filters flow into every query", () => {
  const context = buildQuery(
    formData({
      row_limit: 777,
      adhoc_filters: [
        {
          clause: "WHERE",
          expressionType: "SIMPLE",
          operator: "==",
          subject: "category",
          comparator: "beer",
        },
      ],
    }) as never,
  );
  context.queries.forEach(query => {
    expect(query.row_limit).toBe(777);
    expect(query.filters?.some(f => f.col === "category")).toBe(true);
  });
});
