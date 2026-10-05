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
  bucketCount,
  bucketIndexForTs,
  buildBucketStarts,
  extractAppliedDateRange,
  extractFilterPeriods,
  formatBucketDate,
  formatHourAxisLabel,
  formatPeriodLabel,
  HOUR_MS,
  isDateFilterPresent,
  OWN_SPAN_TAG,
  parseGrain,
  parsePeriodEndMs,
  parsePeriodMs,
  periodBucketCount,
  resolvePeriodsSource,
  snapEndExclusiveMs,
  snapStartMs,
  spanFilterValue,
  stripTaggedPeriodRangeFilters,
  validatePeriods,
  DAY_MS,
  PERIOD_RANGES_TAG,
} from "./periods";

const utc = (
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0,
) => Date.UTC(y, m - 1, d, hh, mm, ss);

test("parsePeriodMs accepts date-only, datetime and epoch numbers", () => {
  expect(parsePeriodMs("2026-01-05")).toBe(utc(2026, 1, 5));
  expect(parsePeriodMs("2026-01-05T10:30:00")).toBe(utc(2026, 1, 5, 10, 30));
  expect(parsePeriodMs("2026-01-05 10:30")).toBe(utc(2026, 1, 5, 10, 30));
  expect(parsePeriodMs(1767571200000)).toBe(1767571200000);
  expect(parsePeriodMs("not a date")).toBeNull();
  expect(parsePeriodMs("2026-13-01")).toBeNull();
  expect(parsePeriodMs("2026-01-05T25:00")).toBeNull();
  expect(parsePeriodMs(undefined)).toBeNull();
});

test("parsePeriodEndMs extends date-only ends to the end of the day", () => {
  expect(parsePeriodEndMs("2026-01-09")).toBe(utc(2026, 1, 9) + DAY_MS - 1);
  expect(parsePeriodEndMs("2026-01-09T12:00")).toBe(utc(2026, 1, 9, 12));
  expect(parsePeriodEndMs("bad")).toBeNull();
});

test("impossible calendar dates are rejected instead of normalized", () => {
  expect(parsePeriodMs("2026-02-30")).toBeNull();
  expect(parsePeriodEndMs("2026-04-31")).toBeNull();
  expect(parsePeriodMs("2026-02-29")).toBeNull(); // 2026 is not a leap year
  expect(parsePeriodMs("2024-02-29")).toBe(utc(2024, 2, 29)); // leap year ok
});

test("snapping: hour and day are arithmetic, week starts on Monday", () => {
  expect(snapStartMs(utc(2026, 1, 5, 10, 30), "hour")).toBe(
    utc(2026, 1, 5, 10),
  );
  expect(snapStartMs(utc(2026, 1, 5, 10, 30), "day")).toBe(utc(2026, 1, 5));
  // 2026-01-05 is a Monday
  expect(snapStartMs(utc(2026, 1, 7, 12), "week")).toBe(utc(2026, 1, 5));
  expect(snapStartMs(utc(2026, 1, 5), "week")).toBe(utc(2026, 1, 5));
  expect(snapStartMs(utc(2026, 2, 15), "month")).toBe(utc(2026, 2, 1));
  expect(snapStartMs(utc(2026, 4, 15), "quarter")).toBe(utc(2026, 4, 1));
  expect(snapStartMs(utc(2026, 4, 15), "year")).toBe(utc(2026, 1, 1));
});

test("exclusive end snaps up to the next boundary", () => {
  expect(snapEndExclusiveMs(utc(2026, 1, 9, 23, 59, 59), "day")).toBe(
    utc(2026, 1, 10),
  );
  // exact boundary stays as the exclusive bound
  expect(snapEndExclusiveMs(utc(2026, 1, 10), "day")).toBe(utc(2026, 1, 10));
  expect(snapEndExclusiveMs(utc(2026, 2, 15), "month")).toBe(utc(2026, 3, 1));
  expect(snapEndExclusiveMs(utc(2026, 12, 15), "quarter")).toBe(
    utc(2027, 1, 1),
  );
  expect(snapEndExclusiveMs(utc(2026, 1, 5, 12, 30), "hour")).toBe(
    utc(2026, 1, 5, 13),
  );
});

test("day and hour buckets are dense arithmetic steps", () => {
  const buckets = buildBucketStarts(
    utc(2026, 1, 5),
    utc(2026, 1, 10),
    "day",
  );
  expect(buckets).toHaveLength(5);
  expect(buckets[0]).toBe(utc(2026, 1, 5));
  expect(buckets[4]).toBe(utc(2026, 1, 9));

  const hours = buildBucketStarts(
    utc(2026, 1, 5, 10),
    utc(2026, 1, 5, 13),
    "hour",
  );
  expect(hours).toHaveLength(3);
  expect(hours[0]).toBe(utc(2026, 1, 5, 10));
});

test("week and month buckets step by calendar boundaries", () => {
  // Mon 05.01 → Sun 11.01 (exclusive end Mon 12.01): one week bucket
  expect(bucketCount(utc(2026, 1, 5), utc(2026, 1, 12), "week")).toBe(1);
  // Mon 05.01 → Sun 18.01: two week buckets
  expect(bucketCount(utc(2026, 1, 5), utc(2026, 1, 19), "week")).toBe(2);

  // weeks in month: both January and February 2026 hold 4 Monday-started
  // weeks inside the 05.01–01.02 / 02.02–01.03 windows
  expect(periodBucketCount({ startMs: utc(2026, 1, 5), endMs: utc(2026, 2, 1, 23, 59, 59) }, "week")).toBe(4);
  expect(periodBucketCount({ startMs: utc(2026, 2, 2), endMs: utc(2026, 3, 1, 23, 59, 59) }, "week")).toBe(4);
  // a five-week window yields five buckets (corner case: weeks per month)
  expect(periodBucketCount({ startMs: utc(2026, 6, 1), endMs: utc(2026, 7, 5, 23, 59, 59) }, "week")).toBe(5);

  expect(bucketCount(utc(2026, 1, 1), utc(2026, 4, 1), "month")).toBe(3);
  expect(bucketCount(utc(2026, 1, 1), utc(2026, 1, 1), "month")).toBe(0);
  expect(bucketCount(utc(2026, 1, 1), utc(2026, 4, 1), "quarter")).toBe(1);
  expect(bucketCount(utc(2026, 1, 1), utc(2027, 1, 1), "year")).toBe(1);
});

test("a full year compared by weeks produces 53 relative buckets", () => {
  const period = { startMs: utc(2026, 1, 1), endMs: utc(2026, 12, 31, 23, 59, 59) };
  expect(periodBucketCount(period, "week")).toBe(53);
  expect(periodBucketCount(period, "month")).toBe(12);
  expect(periodBucketCount(period, "quarter")).toBe(4);
});

test("bucketIndexForTs maps timestamps to relative positions", () => {
  const start = utc(2026, 1, 5);
  expect(bucketIndexForTs(utc(2026, 1, 5), start, "day", 5)).toBe(0);
  expect(bucketIndexForTs(utc(2026, 1, 7), start, "day", 5)).toBe(2);
  expect(bucketIndexForTs(utc(2026, 1, 4), start, "day", 5)).toBe(-1);
  expect(bucketIndexForTs(utc(2026, 1, 10), start, "day", 5)).toBe(-1);
  expect(
    bucketIndexForTs(utc(2026, 3, 1), utc(2026, 1, 1), "month", 12),
  ).toBe(2);
  expect(
    bucketIndexForTs(utc(2026, 2, 1), utc(2026, 1, 1), "quarter", 4),
  ).toBe(0);
  expect(
    bucketIndexForTs(utc(2026, 4, 1), utc(2026, 1, 1), "quarter", 4),
  ).toBe(1);
});

test("validatePeriods accepts equal-length periods", () => {
  const result = validatePeriods([
    { start: "2026-01-05", end: "2026-01-09" },
    { start: "2026-02-02", end: "2026-02-06" },
  ]);
  expect(result.errors).toEqual([]);
  expect(result.periods).toHaveLength(2);
  expect(result.periods[0].startMs).toBe(utc(2026, 1, 5));
  expect(result.periods[0].endMs).toBe(utc(2026, 1, 9) + DAY_MS - 1);
});

test("validatePeriods blocks sets with unequal durations", () => {
  const result = validatePeriods([
    { start: "2026-01-05", end: "2026-01-09" },
    { start: "2026-02-02", end: "2026-02-08" },
  ]);
  expect(result.periods).toHaveLength(0);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0].type).toBe("length_mismatch");
  if (result.errors[0].type === "length_mismatch") {
    // fractional ms durations of date-only periods round to whole days
    expect(Math.round(result.errors[0].min)).toBe(5);
    expect(Math.round(result.errors[0].max)).toBe(7);
  }
});

test("validatePeriods drops invalid entries and reports them", () => {
  const result = validatePeriods([
    { start: "2026-01-05", end: "2026-01-09" },
    { start: "2026-02-02", end: "" },
    { start: "2026-03-02", end: "2026-03-01" },
    "garbage",
  ]);
  expect(result.periods).toHaveLength(1);
  expect(result.errors).toEqual([
    { type: "invalid_dates", index: 1 },
    { type: "end_before_start", index: 2 },
    { type: "invalid_dates", index: 3 },
  ]);
});

test("validatePeriods truncates above the limit and warns on overlap", () => {
  // date-only ends cover their whole day, so these are seven 1-day periods
  const many = [1, 2, 3, 4, 5, 6, 7].map(week => ({
    start: `2026-01-${String(week).padStart(2, "0")}`,
    end: `2026-01-${String(week).padStart(2, "0")}`,
  }));
  const truncated = validatePeriods(many);
  expect(truncated.warnings).toEqual([{ type: "truncated", kept: 5, dropped: 2 }]);
  expect(truncated.periods).toHaveLength(5);

  const overlapped = validatePeriods([
    { start: "2026-01-05", end: "2026-01-09" },
    { start: "2026-01-08", end: "2026-01-12" },
  ]);
  expect(overlapped.periods).toHaveLength(2);
  expect(overlapped.warnings).toEqual([{ type: "overlap" }]);

  const zeroLength = validatePeriods([
    { start: "2026-01-05T10:00", end: "2026-01-05T10:00" },
  ]);
  expect(zeroLength.periods).toHaveLength(0);
  expect(zeroLength.errors).toEqual([{ type: "end_before_start", index: 0 }]);
});

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
  // calendar-style >=/<= pair (on any column)
  expect(
    extractAppliedDateRange({
      filters: [
        { col: "ds", op: ">=", val: "2026-01-06" },
        { col: "ds", op: "<=", val: "2026-01-07" },
      ],
    }),
  ).toEqual({ startMs: Date.UTC(2026, 0, 6), endMs: Date.UTC(2026, 0, 7) });
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

test("stripTaggedPeriodRangeFilters removes tagged clauses (foreign and own)", () => {
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
  expect(stripTaggedPeriodRangeFilters(undefined)).toEqual([]);
  expect(
    stripTaggedPeriodRangeFilters([tagged, ownSpan, regular, otherSql]),
  ).toEqual([regular, otherSql]);
});

test("parseGrain falls back to day on unknown values", () => {
  expect(parseGrain("week")).toBe("week");
  expect(parseGrain("decade")).toBe("day");
  expect(parseGrain(undefined)).toBe("day");
});

test("formatPeriodLabel renders compact ranges", () => {
  expect(
    formatPeriodLabel({ startMs: utc(2026, 1, 5), endMs: utc(2026, 1, 9, 23, 59, 59) }),
  ).toBe("05.01–09.01.2026");
  expect(
    formatPeriodLabel({ startMs: utc(2025, 12, 31), endMs: utc(2026, 1, 4, 23, 59, 59) }),
  ).toBe("31.12.2025–04.01.2026");
});

test("spanFilterValue covers the whole span with an exclusive upper bound", () => {
  const value = spanFilterValue([
    { startMs: utc(2026, 2, 12), endMs: utc(2026, 2, 16, 23, 59, 59) },
    { startMs: utc(2026, 1, 5), endMs: utc(2026, 1, 9, 23, 59, 59) },
  ]);
  expect(value).toBe("2026-01-05 00:00:00 : 2026-02-17 00:00:00");
});

test("formatBucketDate formats per granularity", () => {
  expect(formatBucketDate(utc(2026, 1, 5, 9), "hour")).toBe("05.01 09:00");
  expect(formatBucketDate(utc(2026, 1, 5), "day")).toBe("05.01.2026");
  expect(formatBucketDate(utc(2026, 3, 1), "week")).toBe("01.03.2026");
  expect(formatBucketDate(utc(2026, 3, 1), "month")).toBe("03.2026");
  expect(formatBucketDate(utc(2026, 4, 1), "quarter")).toBe("Q2 2026");
  expect(formatBucketDate(utc(2026, 4, 1), "year")).toBe("2026");
  expect(formatBucketDate(null, "day")).toBe("—");
  expect(formatBucketDate(undefined, "day")).toBe("—");
});

test("hour axis labels show the clock time with a date at midnight", () => {
  expect(formatHourAxisLabel(utc(2026, 1, 5))).toBe("05.01 00:00");
  expect(formatHourAxisLabel(utc(2026, 1, 5, 12))).toBe("12:00");
  expect(formatHourAxisLabel(utc(2026, 1, 5, 9, 30))).toBe("09:00");
});

test("hour constant is one hour in ms", () => {
  expect(HOUR_MS).toBe(3_600_000);
});
