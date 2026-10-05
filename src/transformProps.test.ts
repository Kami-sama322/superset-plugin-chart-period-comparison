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
function chartProps(grain, camel) {
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
    rawFormData: raw,
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
