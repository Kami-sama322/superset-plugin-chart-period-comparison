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
  extractAppliedDateRange,
  extractFilterPeriods,
  isDateFilterPresent,
  OWN_SPAN_TAG,
  PERIOD_RANGES_TAG,
  resolvePeriodsSource,
  stripTaggedDateFilterClauses,
} from "./dateFilterSignals";

const utc = (
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0,
) => Date.UTC(y, m - 1, d, hh, mm, ss);

test("resolvePeriodsSource: any date filter beats ownState beats config", () => {
  const form = [{ start: "2026-01-01", end: "2026-01-02" }];
  const structured = [{ col: "ds", start: "2026-02-01", end: "2026-02-03" }];
  expect(resolvePeriodsSource(undefined, form)).toEqual({
    periods: form,
    source: "config",
  });
  expect(resolvePeriodsSource({}, form)).toEqual({
    periods: form,
    source: "config",
  });
  expect(resolvePeriodsSource({ periods: [] }, form)).toEqual({
    periods: [],
    source: "own",
  });
  expect(resolvePeriodsSource({ periods: form }, undefined)).toEqual({
    periods: form,
    source: "own",
  });
  // the period_ranges filter with applied ranges (col is dropped — the
  // chart applies the ranges to its own time column)
  expect(
    resolvePeriodsSource({ periods: form }, undefined, {
      custom_form_data: structured,
    }),
  ).toEqual({
    periods: [{ start: "2026-02-01", end: "2026-02-03" }],
    source: "filter",
  });
  // the period_ranges filter present but empty — the chart keeps its own
  // configured periods (they are simply not overridden), pickers hidden
  expect(
    resolvePeriodsSource({ periods: form }, form, {
      custom_form_data: [{ col: "ds" }],
    }),
  ).toEqual({ periods: form, source: "date_filter" });
  // another date filter (TEMPORAL_RANGE from calendar/built-in/charts):
  // the chart keeps its own configured periods
  expect(
    resolvePeriodsSource({ periods: form }, form, {
      filters: [{ col: "ds", op: "TEMPORAL_RANGE", val: "a : b" }],
    }),
  ).toEqual({ periods: form, source: "date_filter" });
  // a time_range override (built-in Time range filter)
  expect(
    resolvePeriodsSource({ periods: form }, form, {
      time_range: "2026-01-01 : 2026-02-01",
    }),
  ).toEqual({ periods: form, source: "date_filter" });
  // a simple clause whose value parses as a date (calendar filter on any
  // column)
  expect(
    resolvePeriodsSource({ periods: form }, form, {
      filters: [{ col: "ds", op: ">=", val: "2026-01-01" }],
    }),
  ).toEqual({ periods: form, source: "date_filter" });
  // the same clause on a DIFFERENT column is still a date filter signal
  expect(
    resolvePeriodsSource({ periods: form }, form, {
      filters: [{ col: "other_col", op: ">=", val: "2026-01-01" }],
    }),
  ).toEqual({ periods: form, source: "date_filter" });
  // a non-date value is not a date filter signal
  expect(
    resolvePeriodsSource({ periods: form }, form, {
      filters: [{ col: "region", op: "==", val: "EU" }],
    }),
  ).toEqual({ periods: form, source: "own" });
  // the chart's own span tag is NOT a signal (no self-deferral)
  expect(
    resolvePeriodsSource({ periods: form }, form, {
      adhoc_filters: [
        {
          clause: "WHERE",
          expressionType: "SQL",
          sqlExpression: `${OWN_SPAN_TAG} (ds >= '2026-01-05')`,
        },
      ],
    }),
  ).toEqual({ periods: form, source: "own" });
});

test("extractFilterPeriods reads custom_form_data entries", () => {
  expect(extractFilterPeriods(undefined)).toEqual([]);
  expect(extractFilterPeriods({})).toEqual([]);
  expect(
    extractFilterPeriods({
      filters: [],
      custom_form_data: [
        { col: "ds", start: "2026-01-05T00:00:00.000Z", end: "2026-01-09T23:59:59.999Z" },
        { col: "ds" },
        "garbage",
      ],
    }),
  ).toEqual([
    { start: "2026-01-05T00:00:00.000Z", end: "2026-01-09T23:59:59.999Z" },
  ]);
});

test("extractAppliedDateRange reads the window applied by any date filter", () => {
  // calendar-style >=/<= pair (inclusive upper bound)
  expect(
    extractAppliedDateRange({
      filters: [
        { col: "ds", op: ">=", val: "2026-01-06" },
        { col: "ds", op: "<=", val: "2026-01-07" },
      ],
    }),
  ).toEqual({ startMs: Date.UTC(2026, 0, 6), endMs: Date.UTC(2026, 0, 8) });
  // built-in time range override
  expect(
    extractAppliedDateRange({
      time_range: "2026-02-01 00:00:00 : 2026-02-10 00:00:00",
    }),
  ).toEqual({ startMs: Date.UTC(2026, 1, 1), endMs: Date.UTC(2026, 1, 10) });
  // TEMPORAL_RANGE clause
  expect(
    extractAppliedDateRange({
      filters: [{ col: "ds", op: "TEMPORAL_RANGE", val: "2026-03-01 : 2026-03-05" }],
    }),
  ).toEqual({ startMs: Date.UTC(2026, 2, 1), endMs: Date.UTC(2026, 2, 5) });
  // non-date values and unparseable ranges are ignored
  expect(
    extractAppliedDateRange({ filters: [{ col: "region", op: "==", val: "EU" }] }),
  ).toBeNull();
  expect(extractAppliedDateRange({ time_range: "Last week" })).toBeNull();
  // an upper bound alone is not a range
  expect(
    extractAppliedDateRange({
      filters: [{ col: "ds", op: "<=", val: "2026-01-07" }],
    }),
  ).toBeNull();
});

test("isDateFilterPresent detects every date-filter shape", () => {
  expect(isDateFilterPresent(undefined)).toBe(false);
  expect(isDateFilterPresent({})).toBe(false);
  expect(isDateFilterPresent({ custom_form_data: [{ col: "ds" }] })).toBe(true);
  expect(
    isDateFilterPresent({ filters: [{ col: "region", op: "==", val: "EU" }] }),
  ).toBe(false);
  expect(
    isDateFilterPresent({
      filters: [{ col: "ds", op: "TEMPORAL_RANGE", val: "a : b" }],
    }),
  ).toBe(true);
  // any column — the value parsing as a date is what matters
  expect(
    isDateFilterPresent({
      filters: [{ col: "other", op: ">=", val: "2026-01-01" }],
    }),
  ).toBe(true);
  expect(
    isDateFilterPresent({
      adhoc_filters: [{ sqlExpression: `${PERIOD_RANGES_TAG} (ds >= 'a')` }],
    }),
  ).toBe(true);
  // the chart's own span tag is not a foreign date filter
  expect(
    isDateFilterPresent({
      adhoc_filters: [{ sqlExpression: `${OWN_SPAN_TAG} (ds >= 'a')` }],
    }),
  ).toBe(false);
  expect(isDateFilterPresent({ time_range: "a : b" })).toBe(true);
  expect(isDateFilterPresent({ extras: { time_range: "a : b" } })).toBe(true);
});

test("stripTaggedDateFilterClauses removes tagged clauses (foreign and own)", () => {
  const tagged = {
    clause: "WHERE",
    expressionType: "SQL",
    sqlExpression: `${PERIOD_RANGES_TAG} (ds >= 'a')`,
  };
  const ownSpan = {
    clause: "WHERE",
    expressionType: "SQL",
    sqlExpression: `${OWN_SPAN_TAG} (ds >= 'a')`,
  };
  const regular = {
    clause: "WHERE",
    expressionType: "SIMPLE",
    operator: "==",
    subject: "region",
    comparator: "EU",
  };
  const otherSql = {
    clause: "WHERE",
    expressionType: "SQL",
    sqlExpression: "region IN ('EU')",
  };
  expect(stripTaggedDateFilterClauses(undefined)).toEqual([]);
  expect(
    stripTaggedDateFilterClauses([tagged, ownSpan, regular, otherSql]),
  ).toEqual([regular, otherSql]);
});

