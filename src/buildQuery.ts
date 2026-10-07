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
import {
  buildQueryContext,
  ensureIsArray,
  getColumnLabel,
  getMetricLabel,
  QueryFormData,
  QueryObject,
} from "@superset-ui/core";
import {
  extractAppliedDateRange,
  isDateFilterClause,
  MAX_PERIODS,
  parseGrain,
  resolvePeriodsSource,
  stripTaggedDateFilterClauses,
  validatePeriods,
  type PeriodRange,
} from "./periods";
import { buildEmptyQuery, buildSpanQuery } from "./queryPlan";
import type { PeriodComparisonQueryFormData } from "./types";

type BuildQueryOptions = {
  ownState?: { periods?: unknown } | null;
};

const ISSUE_TEXT: Record<string, string> = {
  invalid_dates: "invalid or missing dates",
  end_before_start: "the end is before the start",
  length_mismatch: "periods must have the same length",
  truncated: "too many periods",
  overlap: "overlapping periods",
};

/**
 * ONE query for every period source:
 * - the period_ranges filter's structured ranges;
 * - a dashboard date filter (its clauses arrive in the base filters and
 *   define the window — the chart's configured periods are split
 *   client-side, exactly like the stock table renders its window);
 * - the on-chart pickers / control-panel value.
 *
 * The scan window is an OR-group of the periods' own bucket windows in
 * extras.where — exactly the rows the client draws, never the empty gap
 * between distant periods. The tagged date-filter clauses (the
 * period_ranges filter's OR clause and this chart's own span) are stripped
 * from the formData BEFORE the query is built — they target other charts,
 * would AND-narrow the single query, and the core moves SQL adhoc clauses
 * into `extras.where` before the callback sees the base query, where a
 * base-level strip could not reach them.
 */
export default function buildQuery(
  formData: PeriodComparisonQueryFormData,
  options: BuildQueryOptions = {},
) {
  const metric = formData.metric;
  if (!metric) {
    throw new Error("Select a metric");
  }
  const xAxis = ensureIsArray(formData.x_axis)[0];
  if (xAxis === null || xAxis === undefined || xAxis === "") {
    throw new Error("Select a time column");
  }
  const timeColumn = getColumnLabel(xAxis);
  if (!timeColumn) {
    throw new Error("Select a time column");
  }

  // Highest priority first: structured periods from the period_ranges
  // filter; then ANY applied date filter (its window REPLACES the chart's
  // periods — one line over exactly what the filter selects); then
  // dashboard ownState (on-chart pickers); then the control-panel value
  const extraFormData = (formData as { extra_form_data?: unknown })
    .extra_form_data;
  const appliedRange = extractAppliedDateRange(extraFormData);
  // Tagged date-filter clauses (the period_ranges filter's OR clause and
  // this chart's own span) target OTHER charts. The core's buildQueryObject
  // consumes adhoc_filters and moves SQL clauses into extras.where BEFORE
  // the callback below sees the base query, so the base-level strip would
  // never find them — remove them at the SOURCE, before buildQueryContext
  // runs processFilters. Untagged filters (simple and SQL) pass through.
  const stripTagged = (filters: unknown): unknown =>
    Array.isArray(filters) ? stripTaggedDateFilterClauses(filters) : filters;
  const cleanFormData = {
    ...formData,
    adhoc_filters: stripTagged(formData.adhoc_filters),
    extra_form_data: extraFormData
      ? {
          ...(extraFormData as Record<string, unknown>),
          adhoc_filters: stripTagged(
            (extraFormData as { adhoc_filters?: unknown }).adhoc_filters,
          ),
        }
      : extraFormData,
  } as PeriodComparisonQueryFormData;
  const { periods: rawPeriodList, source } = resolvePeriodsSource(
    options.ownState,
    formData.periods,
    extraFormData,
  );
  // a date filter's applied window arrives pre-parsed (epoch ms, inclusive
  // end); the other sources carry picker strings
  let periodList: (PeriodRange | { startMs: number; endMs: number })[] =
    rawPeriodList;
  if (source === "date_filter" && appliedRange) {
    // the dashboard date filter's window IS the period (inclusive end)
    periodList = [
      { startMs: appliedRange.startMs, endMs: appliedRange.endMs - 1 },
    ];
  }
  const { periods: validated, errors } = validatePeriods(periodList, {
    maxCount: MAX_PERIODS,
  });
  if (validated.length === 0) {
    // a date filter governs the chart but has no usable periods yet —
    // return an always-empty query instead of erroring (the UI explains)
    if (source === "filter" || source === "date_filter") {
      return buildQueryContext(cleanFormData, {
        buildQuery: (baseQueryObject: QueryObject) => [
          buildEmptyQuery(baseQueryObject) as unknown as QueryObject,
        ],
      });
    }
    const reason = errors.length
      ? `: ${ISSUE_TEXT[errors[0].type] ?? errors[0].type}`
      : "";
    throw new Error(`Add at least one valid period${reason}`);
  }

  const grain = parseGrain(formData.comparison_grain);
  const metricLabel = getMetricLabel(metric);

  return buildQueryContext(cleanFormData, {
    buildQuery: (baseQueryObject: QueryObject) => {
      // A dashboard date filter may bound the scan through its own clauses
      // (simple date filters, TEMPORAL_RANGE — both land in the base
      // filters) or as a bare `time_range` override, which the backend
      // IGNORES for this chart (the query has no `granularity` — the
      // x-axis is a BASE_AXIS). In the latter case the applied window
      // must be added explicitly, or the scan stays unbounded.
      // one shared clause predicate: a dashboard date filter may bound the
      // scan through TEMPORAL_RANGE or simple date-valued clauses (see
      // periods.isDateFilterClause); a time_range-only override is handled
      // by addWindowClause below
      const hasBaseDateBound = (baseQueryObject.filters || []).some(
        isDateFilterClause,
      );
      return [
        buildSpanQuery({
          baseFilters: (baseQueryObject.filters || []) as never[],
          baseAdhocFilters: stripTaggedDateFilterClauses(
            baseQueryObject.adhoc_filters,
          ),
          baseExtras: baseQueryObject.extras,
          periods: validated,
          timeColumn,
          xAxisColumn: xAxis,
          metricLabel,
          grain,
          rowLimit: baseQueryObject.row_limit,
          // no filter governs → the periods' own windows; a filter with
          // clause bounds → they already bind the scan (no duplication);
          // a filter with only a time_range override (or an unparseable
          // window) → the periods/windows below define the scan
          addWindowClause:
            source !== "date_filter" || !appliedRange || !hasBaseDateBound,
        }) as unknown as QueryObject,
      ];
    },
  });
}
