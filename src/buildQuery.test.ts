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
    viz_type: "chart_period_comparison",
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

test("builds ONE query whose window is the OR of the period windows", () => {
  const context = buildQuery(formData());
  expect(context.queries).toHaveLength(1);
  const query = context.queries[0];
  expect(query.metrics).toEqual(["revenue"]);
  expect(query.is_timeseries).toBe(true);
  expect(query.time_grain_sqla).toBe("P1D");
  // base has no extra filters and no span filter — the per-period windows
  // in extras.where bound the scan to exactly the two 5-day periods
  expect(query.filters).toEqual([]);
  expect(query.extras?.where).toBe(
    "((ds >= '2026-01-05 00:00:00' AND ds < '2026-01-10 00:00:00') OR " +
      "(ds >= '2026-02-02 00:00:00' AND ds < '2026-02-07 00:00:00'))",
  );
});

test("dashboard extra filters are shared and precede the window clause", () => {
  const context = buildQuery(
    formData({
      extra_form_data: {
        filters: [{ col: "region", op: "IN", val: ["EU"] }],
      },
    }) as never,
  );
  expect(context.queries).toHaveLength(1);
  expect(context.queries[0].filters).toEqual([
    { col: "region", op: "IN", val: ["EU"] },
  ]);
  expect(context.queries[0].extras?.where).toContain("ds >= '2026-01-05");
});

test("ownState periods override the control-panel value", () => {
  const context = buildQuery(formData(), {
    ownState: {
      periods: [{ start: "2026-03-02", end: "2026-03-06" }],
    },
  });
  expect(context.queries).toHaveLength(1);
  expect(context.queries[0].extras?.where).toBe(
    "(ds >= '2026-03-02 00:00:00' AND ds < '2026-03-07 00:00:00')",
  );
});

test("a date filter with no structured periods yields an always-empty query", () => {
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

test("periods from extra_form_data.custom_form_data define the windows", () => {
  const context = buildQuery({
    ...formData(),
    extra_form_data: {
      custom_form_data: [
        { col: "events_dt", start: "2026-06-01T00:00:00.000Z", end: "2026-06-05T23:59:59.999Z" },
      ],
    },
  } as never);
  expect(context.queries).toHaveLength(1);
  expect(context.queries[0].extras?.where).toBe(
    "(events_dt >= '2026-06-01 00:00:00' AND events_dt < '2026-06-06 00:00:00')",
  );
});

test("a bare time_range override is applied as the window clause", () => {
  // the built-in Time range filter reaches the chart as extra_form_data
  // .time_range only — the backend ignores queryObject.time_range without
  // a granularity column, so the window must be added explicitly
  const context = buildQuery(
    formData({
      extra_form_data: {
        time_range: "2020-09-01 00:00:00 : 2020-09-06 00:00:00",
      },
    }) as never,
  );
  const query = context.queries[0];
  expect(query.filters).toEqual([]);
  expect(query.extras?.where).toBe(
    "(ds >= '2020-09-01 00:00:00' AND ds < '2020-09-06 00:00:00')",
  );
  expect(JSON.stringify(query)).not.toContain("1 = 0");
});

test("tagged date-filter clauses (foreign and own) never reach the query", () => {
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
    },
  } as never);
  // neither the foreign filter clause nor the chart's own span may
  // AND-narrow the single span query — in the real pipeline the core moves
  // SQL adhoc clauses into extras.where, so assert the whole query payload
  const payload = JSON.stringify(context.queries[0]);
  expect(payload).not.toContain("/* period_ranges:v1 */");
  expect(payload).not.toContain("/* period_comparison:own:v1 */");
  // untagged SQL filters still apply (via extras.where)
  expect((context.queries[0].extras as { where?: string }).where).toContain(
    "region IN ('EU')",
  );
});

test("the chart's own stale span does not duplicate or narrow the span clause", () => {
  const ownStaleSpan = {
    clause: "WHERE",
    expressionType: "SQL",
    sqlExpression:
      "/* period_comparison:own:v1 */ (events_dt >= '2026-01-05 00:00:00' AND events_dt < '2026-02-07 00:00:00')",
  };
  const context = buildQuery(
    {
      ...formData(),
      extra_form_data: { adhoc_filters: [ownStaleSpan] },
    } as never,
    {
      ownState: {
        periods: [{ start: "2026-03-02", end: "2026-03-06" }],
      },
    },
  );
  const query = context.queries[0];
  // the span clause reflects the CURRENT picker value...
  expect(query.extras?.where).toBe(
    "(ds >= '2026-03-02 00:00:00' AND ds < '2026-03-07 00:00:00')",
  );
  // ...and the stale emitted span is gone entirely (no duplicate window)
  expect(JSON.stringify(query)).not.toContain("2026-01-05 00:00:00");
});

test("a calendar filter's window replaces the periods and adds no window clause", () => {
  const context = buildQuery(
    formData({
      extra_form_data: {
        filters: [
          { col: "events_dt", op: ">=", val: "2026-10-01" },
          { col: "events_dt", op: "<=", val: "2026-10-07" },
        ],
      },
    }) as never,
  );
  const query = context.queries[0];
  expect(query.filters).toEqual([
    { col: "events_dt", op: ">=", val: "2026-10-01" },
    { col: "events_dt", op: "<=", val: "2026-10-07" },
  ]);
  // the filter's clauses already define the window — no duplicated bound
  // anywhere: no TEMPORAL_RANGE in filters, no window clause in where
  expect(
    query.filters?.some(clause => clause.op === "TEMPORAL_RANGE"),
  ).toBe(false);
  expect(query.extras?.where ?? "").not.toContain("events_dt >= '2026-10-01");
  // and never the always-empty query when the window is valid
  expect(JSON.stringify(query)).not.toContain("1 = 0");
});

test("a chart's stale own span does not survive a calendar filter takeover", () => {
  const ownStaleSpan = {
    clause: "WHERE",
    expressionType: "SQL",
    sqlExpression:
      "/* period_comparison:own:v1 */ (events_dt >= '2026-01-05 00:00:00' AND events_dt < '2026-02-07 00:00:00')",
  };
  const context = buildQuery({
    ...formData(),
    extra_form_data: {
      filters: [
        { col: "events_dt", op: ">=", val: "2026-10-01" },
        { col: "events_dt", op: "<=", val: "2026-10-07" },
      ],
      adhoc_filters: [ownStaleSpan],
    },
  } as never);
  const query = context.queries[0];
  // the calendar window applies...
  expect(query.filters).toEqual([
    { col: "events_dt", op: ">=", val: "2026-10-01" },
    { col: "events_dt", op: "<=", val: "2026-10-07" },
  ]);
  // ...while the stale own span (disjoint from it) is stripped everywhere
  expect(JSON.stringify(query)).not.toContain("2026-01-05 00:00:00");
  expect(JSON.stringify(query)).not.toContain("/* period_comparison");
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

test("grain controls the time grain of the query", () => {
  const context = buildQuery(formData({ comparison_grain: "week" }) as never);
  context.queries.forEach(query => {
    expect(query.time_grain_sqla).toBe("1969-12-29T00:00:00Z/P1W");
    expect(query.extras?.time_grain_sqla).toBe("1969-12-29T00:00:00Z/P1W");
  });
});

test("row_limit and adhoc filters flow into the query", () => {
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
  expect(context.queries[0].row_limit).toBe(777);
  expect(
    context.queries[0].adhoc_filters?.some(
      f => (f as { subject?: string }).subject === "category",
    ),
  ).toBe(true);
});
