/**
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

/**
 * Pure date-range math for period comparison. No runtime dependencies so it
 * stays unit-testable outside the Superset tree.
 *
 * Conventions:
 * - All math is done on UTC epoch milliseconds; naive wall-clock strings
 *   ("YYYY-MM-DD" / "YYYY-MM-DD HH:mm") are parsed as UTC to match the
 *   Superset backend default timezone.
 * - Period bounds are inclusive; every period is normalized to an exclusive
 *   upper bound snapped up to the next granularity boundary.
 */

export type ComparisonGrain =
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type PeriodRange = {
  start: string;
  end: string;
};

export const MAX_PERIODS = 5;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
/** Hard cap for generated buckets (guards against runaway ranges) */
export const MAX_BUCKETS = 10_000;

const PERIOD_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

const pad2 = (value: number) => String(value).padStart(2, "0");

function inRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Parse a wall-clock date string as UTC epoch ms (null when invalid) */
export function parsePeriodMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = parseWallClock(value);
  if (parsed !== null) {
    return parsed;
  }
  // shaped like our wall-clock format but invalid (e.g. 2026-02-30) —
  // never let the lenient Date.parse rescue it
  if (PERIOD_RE.test(value.trim())) {
    return null;
  }
  const fallback = Date.parse(value);
  return Number.isNaN(fallback) ? null : fallback;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseWallClock(value: string): number | null {
  const match = value.trim().match(PERIOD_RE);
  if (!match) {
    return null;
  }
  const [, y, m, d, hh = "0", mm = "0", ss = "0"] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hours = Number(hh);
  const minutes = Number(mm);
  const seconds = Number(ss);
  if (
    !inRange(month, 1, 12) ||
    !inRange(day, 1, 31) ||
    !inRange(hours, 0, 23) ||
    !inRange(minutes, 0, 59) ||
    !inRange(seconds, 0, 59)
  ) {
    return null;
  }
  const ms = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  // reject non-existent calendar dates (Date.UTC silently normalizes
  // "2026-02-30" into March)
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/**
 * Parse the inclusive END of a period. Date-only strings cover their whole
 * last day ("2026-01-09" → 23:59:59.999), values with an explicit time are
 * taken as-is.
 */
export function parsePeriodEndMs(value: unknown): number | null {
  if (
    typeof value === "string" &&
    DATE_ONLY_RE.test(value.trim()) &&
    parseWallClock(value) !== null
  ) {
    return (parseWallClock(value) as number) + DAY_MS - 1;
  }
  return parsePeriodMs(value);
}

/** UTC epoch ms → "YYYY-MM-DD HH:mm:ss" (the format of TEMPORAL_RANGE values) */
export function toUtcSqlString(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
  );
}

function monthStart(y: number, m: number): number {
  return Date.UTC(y, m, 1);
}

/** Largest granularity boundary <= ms */
export function floorBoundary(ms: number, grain: ComparisonGrain): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (grain) {
    case "hour":
      return Math.floor(ms / HOUR_MS) * HOUR_MS;
    case "day":
      return Math.floor(ms / DAY_MS) * DAY_MS;
    case "week": {
      const dayFloor = Math.floor(ms / DAY_MS) * DAY_MS;
      const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
      return dayFloor - dow * DAY_MS;
    }
    case "month":
      return monthStart(y, m);
    case "quarter":
      return monthStart(y, Math.floor(m / 3) * 3);
    case "year":
      return monthStart(y, 0);
    default:
      return ms;
  }
}

/** Smallest granularity boundary strictly after ms */
function nextBoundary(ms: number, grain: ComparisonGrain): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (grain) {
    case "hour":
      return floorBoundary(ms, grain) + HOUR_MS;
    case "day":
      return floorBoundary(ms, grain) + DAY_MS;
    case "week":
      return floorBoundary(ms, grain) + 7 * DAY_MS;
    case "month":
      return monthStart(y, m + 1);
    case "quarter":
      return monthStart(y, Math.floor(m / 3) * 3 + 3);
    case "year":
      return monthStart(y + 1, 0);
    default:
      return ms;
  }
}

/** Inclusive period start snapped down to the granularity boundary */
export function snapStartMs(ms: number, grain: ComparisonGrain): number {
  return floorBoundary(ms, grain);
}

/** Inclusive period end converted to an exclusive bound snapped up */
export function snapEndExclusiveMs(
  ms: number,
  grain: ComparisonGrain,
): number {
  const floor = floorBoundary(ms, grain);
  return floor === ms ? ms : nextBoundary(ms, grain);
}

const MONTHS_PER_BUCKET: Record<ComparisonGrain, number | null> = {
  hour: null,
  day: null,
  week: null,
  month: 1,
  quarter: 3,
  year: 12,
};

/**
 * Dense bucket start sequence [startMs, endExclusiveMs) at the granularity.
 * Calendar grains step by whole months from the (already snapped) start.
 */
export function buildBucketStarts(
  startMs: number,
  endExclusiveMs: number,
  grain: ComparisonGrain,
): number[] {
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endExclusiveMs) ||
    startMs >= endExclusiveMs
  ) {
    return [];
  }
  const monthsPerBucket = MONTHS_PER_BUCKET[grain];
  const buckets: number[] = [];
  if (monthsPerBucket === null) {
    const step =
      grain === "hour" ? HOUR_MS : grain === "day" ? DAY_MS : 7 * DAY_MS;
    for (let t = startMs; t < endExclusiveMs && buckets.length < MAX_BUCKETS; t += step) {
      buckets.push(t);
    }
    return buckets;
  }
  const d = new Date(startMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  for (let i = 0; buckets.length < MAX_BUCKETS; i += 1) {
    const t = monthStart(y, m + i * monthsPerBucket);
    if (t >= endExclusiveMs) {
      break;
    }
    buckets.push(t);
  }
  return buckets;
}

export function bucketCount(
  startMs: number,
  endExclusiveMs: number,
  grain: ComparisonGrain,
): number {
  return buildBucketStarts(startMs, endExclusiveMs, grain).length;
}

/** Bucket index of a timestamp relative to the snapped period start (-1 when out of range) */
export function bucketIndexForTs(
  tsMs: number,
  startMs: number,
  grain: ComparisonGrain,
  count: number,
): number {
  if (!Number.isFinite(tsMs) || tsMs < startMs || count <= 0) {
    return -1;
  }
  const monthsPerBucket = MONTHS_PER_BUCKET[grain];
  let index: number;
  if (monthsPerBucket === null) {
    const step =
      grain === "hour" ? HOUR_MS : grain === "day" ? DAY_MS : 7 * DAY_MS;
    index = Math.floor((tsMs - startMs) / step);
  } else {
    const from = new Date(startMs);
    const to = new Date(tsMs);
    const diff =
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth());
    index = Math.floor(diff / monthsPerBucket);
  }
  return index >= 0 && index < count ? index : -1;
}

export type ValidatedPeriod = {
  startMs: number;
  endMs: number;
};

/** Where the rendered periods come from */
export type PeriodsSource = "filter" | "own" | "config";

/**
 * Tag prefix of the OR clause emitted by the `period_ranges` native filter
 * (superset-plugin-filter-period-ranges). Tagged clauses target OTHER
 * charts and must be stripped from this chart's base filters.
 */
export const PERIOD_RANGES_TAG = "/* period_ranges:v1 */";

/**
 * Tag prefix of THIS chart's own span clause (emitted to cross-filter
 * other charts). Excluded from the date-filter presence detection so the
 * chart never defers to itself.
 */
export const OWN_SPAN_TAG = "/* period_comparison:own:v1 */";

/**
 * Structured ranges emitted by the `period_ranges` native filter via
 * `extra_form_data.custom_form_data` (an APPEND key that reaches every
 * in-scope chart's formData verbatim).
 */
export function extractFilterPeriods(extraFormData: unknown): PeriodRange[] {
  const bag = (extraFormData || {}) as { custom_form_data?: unknown };
  const list = bag.custom_form_data;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map(entry => {
      const source = (entry || {}) as Record<string, unknown>;
      return {
        start: typeof source.start === "string" ? source.start : "",
        end: typeof source.end === "string" ? source.end : "",
      };
    })
    .filter(period => period.start !== "" || period.end !== "");
}

/**
 * True when ANY date/time-range filter is present on the dashboard and
 * reaches this chart through the aggregated extra_form_data:
 * - the period_ranges filter (structured entries or its tagged clause),
 * - any native/cross filter emitting TEMPORAL_RANGE clauses (calendar,
 *   built-in time range, other charts),
 * - a time_range override (built-in Time range filter).
 *
 * This chart's own span (tagged) is intentionally NOT a signal — otherwise
 * the chart would defer to itself.
 */
export function isDateFilterPresent(extraFormData: unknown): boolean {
  const bag = (extraFormData || {}) as {
    custom_form_data?: unknown;
    filters?: unknown;
    adhoc_filters?: unknown;
    time_range?: unknown;
    extras?: { time_range?: unknown };
  };
  if (Array.isArray(bag.custom_form_data) && bag.custom_form_data.length > 0) {
    return true;
  }
  if (Array.isArray(bag.filters)) {
    const hasTemporal = bag.filters.some(
      item => (item as { op?: unknown })?.op === "TEMPORAL_RANGE",
    );
    if (hasTemporal) {
      return true;
    }
  }
  if (Array.isArray(bag.adhoc_filters)) {
    const hasForeignTagged = bag.adhoc_filters.some(item => {
      const sql = (item as { sqlExpression?: unknown })?.sqlExpression;
      return (
        typeof sql === "string" && sql.startsWith(PERIOD_RANGES_TAG)
      );
    });
    if (hasForeignTagged) {
      return true;
    }
  }
  if (bag.time_range != null || bag.extras?.time_range != null) {
    return true;
  }
  return false;
}

/** Remove ALL tagged date-filter clauses (foreign + this chart's own span) */
export function stripTaggedPeriodRangeFilters(adhocFilters: unknown): unknown[] {
  if (!Array.isArray(adhocFilters)) {
    return [];
  }
  return adhocFilters.filter(item => {
    const sql = (item as { sqlExpression?: unknown })?.sqlExpression;
    return !(
      typeof sql === "string" &&
      (sql.startsWith(PERIOD_RANGES_TAG) || sql.startsWith(OWN_SPAN_TAG))
    );
  });
}

/**
 * Authoritative source of the displayed/queried periods, highest priority
 * first: ANY date/time filter reaching this chart (structured periods from
 * the period_ranges filter, or just its presence — in which case the chart
 * defers even before the filter has values), the dashboard ownState (the
 * on-chart pickers), the control-panel value.
 */
export function resolvePeriodsSource(
  ownState: { periods?: unknown } | null | undefined,
  formPeriods: unknown,
  extraFormData: unknown = null,
): { periods: PeriodRange[]; source: PeriodsSource } {
  if (isDateFilterPresent(extraFormData)) {
    return {
      periods: extractFilterPeriods(extraFormData),
      source: "filter",
    };
  }
  if (ownState && Array.isArray(ownState.periods)) {
    return { periods: ownState.periods as PeriodRange[], source: "own" };
  }
  return {
    periods: Array.isArray(formPeriods) ? (formPeriods as PeriodRange[]) : [],
    source: "config",
  };
}

/** Structured validation issues; UI translates them via t() */
export type ValidationIssue =
  | { type: "invalid_dates"; index: number }
  | { type: "end_before_start"; index: number }
  | { type: "length_mismatch"; min: number; max: number }
  | { type: "truncated"; kept: number; dropped: number }
  | { type: "overlap" };

export type Validation = {
  periods: ValidatedPeriod[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export function periodDurationDays(period: ValidatedPeriod): number {
  return (period.endMs - period.startMs) / DAY_MS;
}

const DURATION_TOLERANCE_MS = 60_000;

/** Normalize a raw grain value, falling back to "day" */
export function parseGrain(value: unknown): ComparisonGrain {
  return value === "hour" ||
    value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "quarter" ||
    value === "year"
    ? value
    : "day";
}

/**
 * Parse and normalize the raw period list.
 * - Unparsable / inverted ranges are dropped with an error each.
 * - Unequal durations block the whole set (periods must be comparable).
 * - Overlapping periods only warn.
 * - More than `maxCount` entries are truncated with a warning.
 */
export function validatePeriods(
  raw: unknown,
  opts: { maxCount?: number } = {},
): Validation {
  const maxCount = opts.maxCount ?? MAX_PERIODS;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > maxCount) {
    warnings.push({
      type: "truncated",
      kept: maxCount,
      dropped: list.length - maxCount,
    });
  }
  const periods: ValidatedPeriod[] = [];
  list.slice(0, maxCount).forEach((entry, index) => {
    const source = (entry || {}) as Partial<PeriodRange>;
    const startMs = parsePeriodMs(source.start);
    const endMs = parsePeriodEndMs(source.end);
    if (startMs === null || endMs === null) {
      errors.push({ type: "invalid_dates", index });
      return;
    }
    if (endMs <= startMs) {
      errors.push({ type: "end_before_start", index });
      return;
    }
    periods.push({ startMs, endMs });
  });
  if (periods.length >= 2) {
    const durations = periods.map(periodDurationDays);
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);
    if (maxDuration - minDuration > DURATION_TOLERANCE_MS / DAY_MS) {
      errors.push({ type: "length_mismatch", min: minDuration, max: maxDuration });
      return { periods: [], errors, warnings };
    }
    const sorted = [...periods].sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startMs < sorted[i - 1].endMs) {
        warnings.push({ type: "overlap" });
        break;
      }
    }
  }
  return { periods, errors, warnings };
}

/** Bucket sequence of a period at the given grain (bounds snapped per grain) */
export function periodBucketStarts(
  period: ValidatedPeriod,
  grain: ComparisonGrain,
): number[] {
  return buildBucketStarts(
    snapStartMs(period.startMs, grain),
    snapEndExclusiveMs(period.endMs, grain),
    grain,
  );
}

export function periodBucketCount(
  period: ValidatedPeriod,
  grain: ComparisonGrain,
): number {
  return periodBucketStarts(period, grain).length;
}

const SHORT_DATE = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}`;
};
const FULL_DATE = (ms: number) => {
  const d = new Date(ms);
  return `${SHORT_DATE(ms)}.${d.getUTCFullYear()}`;
};

/** Legend label of a period: "05.01–09.01.2026" or full dates across years */
export function formatPeriodLabel(period: ValidatedPeriod): string {
  const from = period.startMs;
  const to = Math.max(period.endMs - 1, period.startMs);
  const sameYear =
    new Date(from).getUTCFullYear() === new Date(to).getUTCFullYear();
  return sameYear
    ? `${SHORT_DATE(from)}–${FULL_DATE(to)}`
    : `${FULL_DATE(from)}–${FULL_DATE(to)}`;
}

/** TEMPORAL_RANGE value covering all periods (day-grain superset span) */
export function spanFilterValue(periods: ValidatedPeriod[]): string {
  const start = Math.min(...periods.map(p => p.startMs));
  const end = Math.max(...periods.map(p => snapEndExclusiveMs(p.endMs, "day")));
  return `${toUtcSqlString(start)} : ${toUtcSqlString(end)}`;
}

/** Human-readable date of a bucket start, per granularity (tooltip) */
export function formatBucketDate(
  ms: number | null | undefined,
  grain: ComparisonGrain,
): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return "—";
  }
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  switch (grain) {
    case "hour":
      return `${SHORT_DATE(ms)} ${pad2(d.getUTCHours())}:00`;
    case "day":
    case "week":
      return FULL_DATE(ms);
    case "month":
      return `${pad2(m)}.${y}`;
    case "quarter":
      return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
    case "year":
      return String(y);
    default:
      return FULL_DATE(ms);
  }
}

/**
 * Hour-grain axis label: the real clock time of the bucket, so "12:00"
 * IS 12:00. A bucket starting a new UTC day carries its date; the others
 * show the plain time.
 */
export function formatHourAxisLabel(ms: number): string {
  const d = new Date(ms);
  if (d.getUTCHours() === 0) {
    return `${SHORT_DATE(ms)} 00:00`;
  }
  return `${pad2(d.getUTCHours())}:00`;
}
