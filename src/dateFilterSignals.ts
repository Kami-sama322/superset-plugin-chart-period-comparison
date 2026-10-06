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
 * The dashboard date-filter contract of this chart: how the aggregated
 * extra_form_data of native/cross filters is detected, parsed and resolved
 * into the chart's period source. Pure module (no core imports), synced
 * tests in dateFilterSignals.test.ts.
 */

import {
  DAY_MS,
  parsePeriodMs,
  snapEndExclusiveMs,
  type PeriodRange,
} from "./periods";

/** Where the rendered periods come from */
export type PeriodsSource =
  | "filter" // structured ranges from the period_ranges filter
  | "date_filter" // another date filter is applied; chart config periods
  | "own" // the on-chart pickers
  | "config"; // the control-panel value

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
 * True when ANY date/time-range filter reaches this chart through the
 * aggregated extra_form_data:
 * - the period_ranges filter (structured entries or its tagged clause),
 * - any native/cross filter emitting TEMPORAL_RANGE clauses (calendar,
 *   built-in time range, other charts),
 * - a time_range override (built-in Time range filter),
 * - any simple clause whose value parses as a date (the calendar filter's
 *   ==/>=/<= on any column).
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
    const hasDateClause = bag.filters.some(item => {
      const clause = item as { op?: unknown; val?: unknown };
      if (clause?.op === "TEMPORAL_RANGE") {
        return true;
      }
      return parsePeriodMs(clause?.val) !== null;
    });
    if (hasDateClause) {
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

/**
 * The date range actually applied by dashboard date filters, as seen by
 * this chart: any simple clause whose value parses as a date (regardless
 * of the column it targets), TEMPORAL_RANGE clauses, or a time_range
 * override with absolute bounds. Null when nothing parseable is applied.
 */
export function extractAppliedDateRange(extraFormData: unknown): {
  startMs: number;
  endMs: number;
} | null {
  const bag = (extraFormData || {}) as {
    filters?: unknown;
    time_range?: unknown;
    extras?: { time_range?: unknown };
  };
  const lower: number[] = [];
  const upper: number[] = [];
  const parseBound = (value: unknown): number | null => {
    if (typeof value !== "string") {
      return null;
    }
    return parsePeriodMs(value);
  };
  if (Array.isArray(bag.filters)) {
    bag.filters.forEach(item => {
      const clause = item as { op?: unknown; val?: unknown };
      if (clause?.op === "TEMPORAL_RANGE") {
        const [s, e] =
          typeof clause.val === "string" ? clause.val.split(" : ") : [];
        const start = parseBound(s);
        const end = parseBound(e);
        if (start !== null && end !== null) {
          lower.push(start);
          upper.push(end);
        }
        return;
      }
      const bound = parseBound(clause?.val);
      if (bound === null) {
        return;
      }
      if (clause.op === "==") {
        lower.push(bound);
        upper.push(bound + DAY_MS);
      } else if (clause.op === ">=") {
        lower.push(bound);
      } else if (clause.op === ">") {
        lower.push(bound + DAY_MS);
      } else if (clause.op === "<=") {
        // inclusive upper bound → exclusive end is the next day
        upper.push(bound + DAY_MS);
      } else if (clause.op === "<") {
        upper.push(bound);
      }
    });
  }
  const timeRange =
    typeof bag.time_range === "string"
      ? bag.time_range
      : typeof bag.extras?.time_range === "string"
        ? bag.extras.time_range
        : null;
  if (timeRange) {
    const [s, e] = timeRange.split(" : ");
    const start = parseBound(s);
    const end = parseBound(e);
    if (start !== null && end !== null) {
      lower.push(start);
      upper.push(end);
    }
  }
  if (lower.length === 0 || upper.length === 0) {
    return null;
  }
  return { startMs: Math.min(...lower), endMs: Math.max(...upper) };
}

/** Remove ALL tagged date-filter clauses (foreign + this chart's own span) */
export function stripTaggedDateFilterClauses(adhocFilters: unknown): unknown[] {
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
 * first:
 * - structured ranges from the period_ranges filter ('filter') — the chart
 *   defers to it completely, even before ranges are selected;
 * - ANY other date filter applied on the dashboard ('date_filter') — the
 *   pickers hide, but the chart keeps its own configured periods and they
 *   are narrowed by the filter through the base query filters;
 * - the dashboard ownState (the on-chart pickers);
 * - the control-panel value.
 */
export function resolvePeriodsSource(
  ownState: { periods?: unknown } | null | undefined,
  formPeriods: unknown,
  extraFormData: unknown = null,
): { periods: PeriodRange[]; source: PeriodsSource } {
  const structured = extractFilterPeriods(extraFormData);
  if (structured.length > 0) {
    return { periods: structured, source: "filter" };
  }
  const formPeriodsList = Array.isArray(formPeriods)
    ? (formPeriods as PeriodRange[])
    : [];
  if (isDateFilterPresent(extraFormData)) {
    // another date filter governs the window; the comparison periods stay
    // the chart's own configured ones (ownState is ignored — its pickers
    // are hidden)
    return { periods: formPeriodsList, source: "date_filter" };
  }
  if (ownState && Array.isArray(ownState.periods)) {
    return { periods: ownState.periods as PeriodRange[], source: "own" };
  }
  return { periods: formPeriodsList, source: "config" };
}
