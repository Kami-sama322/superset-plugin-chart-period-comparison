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
import transformProps from "./transformProps";

const PERIOD = { start: "2026-01-05", end: "2026-01-05" };

/**
 * ChartProps.formData is camelCased by the core (convertKeysToCamelCase),
 * rawFormData stays snake_case — exactly what the dashboard/explore pass.
 */
function chartProps(grain, camel, extraFormData?) {
  const raw = {
    viz_type: "chart_period_comparison",
    datasource: "1__table",
    metric: "m",
    x_axis: "ds",
    comparison_grain: grain,
    periods: [PERIOD],
    row_limit: 1000,
  };
  const formData = {};
  Object.entries(raw).forEach(([key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (camel) {
      formData[camelKey] = value;
    } else {
      formData[key] = value;
    }
  });
  return {
    width: 800,
    height: 600,
    formData,
    rawFormData: extraFormData ? { ...raw, extra_form_data: extraFormData } : raw,
    queriesData: [
      {
        data: [
          { __timestamp: Date.UTC(2026, 0, 5), m: 1 },
          { __timestamp: Date.UTC(2026, 0, 5, 5), m: 2 },
        ],
      },
    ],
    hooks: {},
    ownState: {},
    filterState: {},
  };
}

test("hour axis shows the real clock time of the base period buckets", () => {
  const props = transformProps(chartProps("hour", true));
  const labels = props.echartOptions.xAxis.data;
  // the first bucket starts at 00:00 and carries the date
  expect(labels[0]).toBe("05.01 00:00");
  // "12:00" IS 12:00 — no ordinal off-by-one
  expect(labels[12]).toBe("12:00");
  expect(labels[5]).toBe("05:00");
});

test("axis labels follow the grain from camelCase formData (ChartProps casing)", () => {
  const props = transformProps(chartProps("month", true));
  const labels = props.echartOptions.xAxis.data;
  expect(labels[0]).toBe("Month 1");
});

test("axis labels follow the grain from snake_case formData as well", () => {
  const props = transformProps(chartProps("month", false));
  const labels = props.echartOptions.xAxis.data;
  expect(labels[0]).toBe("Month 1");
});

test("the default grain is day", () => {
  const props = transformProps(chartProps(undefined, true));
  const labels = props.echartOptions.xAxis.data;
  expect(labels[0]).toBe("Day 1");
});

test("periods from the period_ranges filter win and hide the pickers", () => {
  const props = transformProps(
    chartProps("day", true, {
      custom_form_data: [
        { col: "events_dt", start: "2026-03-02T00:00:00.000Z", end: "2026-03-06T23:59:59.999Z" },
        { col: "events_dt", start: "2026-04-06T00:00:00.000Z", end: "2026-04-10T23:59:59.999Z" },
      ],
    }),
  );
  expect(props.periodsSource).toBe("filter");
  expect(props.periods).toHaveLength(2);
  expect(props.periods[0].start).toBe("2026-03-02");
  expect(props.periodsLabel).toContain("02.03");
  expect(props.periodsLabel).toContain("06.04");
});

test("the period_ranges filter's presence marker switches the source to date_filter", () => {
  const props = transformProps(
    chartProps("day", true, {
      custom_form_data: [{ col: "events_dt" }],
    }),
  );
  // no structured ranges — the chart keeps its configured periods but the
  // pickers are hidden (a dashboard date filter governs the window)
  expect(props.periodsSource).toBe("date_filter");
  expect(props.periods).toHaveLength(1);
  expect(props.statusKind).toBeNull();
});

test("an applied TEMPORAL_RANGE filter switches the source to date_filter", () => {
  const props = transformProps(
    chartProps("day", true, {
      filters: [{ col: "ds", op: "TEMPORAL_RANGE", val: "a : b" }],
    }),
  );
  expect(props.periodsSource).toBe("date_filter");
  expect(props.periods).toHaveLength(1);
  expect(props.statusKind).toBeNull();
});

test("a date filter with no data in ANY period shows the empty status", () => {
  const props = transformProps({
    ...chartProps("day", true, {
      filters: [{ col: "ds", op: ">=", val: "2030-01-01" }],
    }),
    queriesData: [{ data: [] }],
  });
  expect(props.periodsSource).toBe("date_filter");
  expect(props.statusKind).toBe("no_data");
});

test("data in at least one period is enough to draw the chart", () => {
  const twoPeriods = [
    { start: "2026-01-05", end: "2026-01-09" },
    { start: "2026-02-02", end: "2026-02-06" },
  ];
  const base = chartProps("day", true, {
    filters: [{ col: "ds", op: ">=", val: "2030-01-01" }],
  });
  const props = transformProps({
    ...base,
    formData: { ...base.formData, periods: twoPeriods },
    rawFormData: {
      ...base.rawFormData,
      periods: twoPeriods,
      extra_form_data: {
        filters: [{ col: "ds", op: ">=", val: "2030-01-01" }],
      },
    },
    queriesData: [
      { data: [] }, // first period — no data
      {
        data: [
          { __timestamp: Date.UTC(2026, 1, 2), m: 7 },
          { __timestamp: Date.UTC(2026, 1, 3), m: 8 },
        ],
      }, // second period — has data
    ],
  } as never);
  expect(props.periodsSource).toBe("date_filter");
  expect(props.statusKind).toBeNull();
  expect(props.echartOptions.series).toHaveLength(2);
  // the empty first period leaves a gap, the second one is drawn
  const series = props.echartOptions.series as { data: (number | null)[] }[];
  expect(series[0].data).toEqual([null, null, null, null, null]);
  expect(series[1].data).toEqual([7, 8, null, null, null]);
});

test("a calendar filter labels the legend and the plaque with its window", () => {
  const base = chartProps("day", true, {
    filters: [
      { col: "ds", op: ">=", val: "2026-01-06" },
      { col: "ds", op: "<=", val: "2026-01-07" },
    ],
  });
  const props = transformProps({
    ...base,
    formData: {
      ...base.formData,
      periods: [
        { start: "2026-01-05", end: "2026-01-09" },
        { start: "2026-02-02", end: "2026-02-06" },
      ],
    },
    rawFormData: {
      ...base.rawFormData,
      periods: [
        { start: "2026-01-05", end: "2026-01-09" },
        { start: "2026-02-02", end: "2026-02-06" },
      ],
      extra_form_data: {
        filters: [
          { col: "ds", op: ">=", val: "2026-01-06" },
          { col: "ds", op: "<=", val: "2026-01-07" },
        ],
      },
    },
    queriesData: [
      {
        data: [{ __timestamp: Date.UTC(2026, 0, 6), m: 1 }],
      },
      { data: [] },
    ],
  } as never);
  expect(props.periodsSource).toBe("date_filter");
  expect(props.appliedDateRangeLabel).toBe("06.01–07.01.2026");
  const series = props.echartOptions.series as { name: string }[];
  expect(series[0].name).toBe("05.01–09.01.2026 (06.01–07.01.2026)");
  expect(series[1].name).toBe("02.02–06.02.2026 (06.01–07.01.2026)");
});

test("the chart's own span tag does not trigger self-deferral", () => {
  const props = transformProps(
    chartProps("day", true, {
      adhoc_filters: [
        {
          clause: "WHERE",
          expressionType: "SQL",
          sqlExpression: "/* period_comparison:own:v1 */ (ds >= '2026-01-05')",
        },
      ],
    }),
  );
  expect(props.periodsSource).toBe("config");
  expect(props.periods).toHaveLength(1);
});

test("without the filter the pickers stay active (source own/config)", () => {
  const props = transformProps(chartProps("day", true));
  expect(props.periodsSource).toBe("config");
  expect(props.periodsLabel).toContain("05.01");
});
