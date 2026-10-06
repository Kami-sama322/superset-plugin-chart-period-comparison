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

test("builds ONE query over the union span of the periods", () => {
  const context = buildQuery(formData());
  expect(context.queries).toHaveLength(1);
  const query = context.queries[0];
  expect(query.metrics).toEqual(["revenue"]);
  expect(query.is_timeseries).toBe(true);
  expect(query.time_grain_sqla).toBe("P1D");
  // base has no extra filters: only the span clause in WHERE
  expect(query.filters).toEqual([
    {
      col: "ds",
      op: "TEMPORAL_RANGE",
      val: "2026-01-05 00:00:00 : 2026-02-07 00:00:00",
    },
  ]);
});

test("dashboard extra filters are shared and precede the span clause", () => {
  const context = buildQuery(
    formData({
      extra_form_data: {
        filters: [{ col: "region", op: "IN", val: ["EU"] }],
      },
    }) as never,
  );
  expect(context.queries).toHaveLength(1);
  expect(context.queries[0].filters?.[0]).toEqual({
    col: "region",
    op: "IN",
    val: ["EU"],
  });
  expect(context.queries[0].filters?.at(-1)?.op).toBe("TEMPORAL_RANGE");
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

test("periods from extra_form_data.custom_form_data define the span", () => {
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
    },
  } as never);
  const adhoc = context.queries[0].adhoc_filters as {
    sqlExpression?: string;
  }[];
  // neither the foreign filter clause nor the chart's own span may
  // AND-narrow the single span query built from the structured periods
  expect(adhoc.some(f => f.sqlExpression?.startsWith("/* period"))).toBe(false);
  expect(adhoc.some(f => f.sqlExpression === "region IN ('EU')")).toBe(true);
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
