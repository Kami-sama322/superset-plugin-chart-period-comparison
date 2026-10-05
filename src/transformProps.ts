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
import { t } from "@apache-superset/core/translation";
import {
  ChartProps,
  ensureIsArray,
  getColumnLabel,
  getMetricLabel,
  getNumberFormatter,
} from "@superset-ui/core";
import {
  extractAppliedDateRange,
  formatHourAxisLabel,
  formatPeriodLabel,
  parseGrain,
  periodBucketCount,
  periodBucketStarts,
  resolvePeriodsSource,
  validatePeriods,
  type ComparisonGrain,
  type PeriodRange,
} from "./periods";
import { buildEchartOptions, seriesSymbolFor } from "./chartOptions";
import { getScale } from "./scale";
import { buildSeries, type Series } from "./seriesData";
import {
  DEFAULT_FORM_DATA,
  type ChartColors,
  type PeriodComparisonQueryFormData,
  type PeriodComparisonTransformedProps,
  type SeriesStyles,
  type StatusKind,
} from "./types";

export const GRAIN_LABEL: Record<ComparisonGrain, string> = {
  hour: "Hour",
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

/**
 * Shared relative axis labels. For the hour grain the labels are the real
 * clock times of the base (first) period's buckets — "12:00" IS 12:00, and
 * a midnight bucket carries its date. Other grains keep the ordinal
 * ("Day 1..N"), which is the whole point of the relative comparison.
 */
function buildAxisLabels(
  grain: ComparisonGrain,
  axisLength: number,
  basePeriod: { startMs: number; endMs: number },
): string[] {
  const baseBuckets = periodBucketStarts(basePeriod, grain);
  return Array.from({ length: axisLength }, (_, index) => {
    if (grain === "hour") {
      const bucket = index < baseBuckets.length ? baseBuckets[index] : null;
      if (bucket !== null) {
        return formatHourAxisLabel(bucket);
      }
    }
    return t(`${GRAIN_LABEL[grain]} ${index + 1}`);
  });
}

const noOp = () => {};

/**
 * ChartProps.formData is camelCased while DEFAULT_FORM_DATA and raw form
 * state use snake_case keys. The camelCase value (the live control value)
 * must win over the snake_case default, so check it first.
 */
function pick<T>(
  source: unknown,
  camelKey: string,
  snakeKey: string,
  fallback: T,
): T {
  const bag = source as Record<string, unknown>;
  const camelValue = bag?.[camelKey];
  if (camelValue !== undefined && camelValue !== null) {
    return camelValue as T;
  }
  const snakeValue = bag?.[snakeKey];
  if (snakeValue !== undefined && snakeValue !== null) {
    return snakeValue as T;
  }
  return fallback;
}

function pickNumber(
  source: unknown,
  camelKey: string,
  snakeKey: string,
  fallback: number,
  min: number,
  max?: number,
): number {
  const value = Number(pick(source, camelKey, snakeKey, fallback));
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const clamped = Math.max(min, value);
  return max === undefined ? clamped : Math.min(max, clamped);
}

function normalizePeriods(value: unknown): PeriodRange[] {
  if (!Array.isArray(value)) {
    return [];
  }
  // shape normalization only — cleared pickers stay visible so the user
  // sees exactly what they left off
  return value.map(entry => {
    const source = (entry || {}) as Record<string, unknown>;
    return {
      start: typeof source.start === "string" ? source.start : "",
      end: typeof source.end === "string" ? source.end : "",
    };
  });
}

export default function transformProps(
  chartProps: ChartProps,
): PeriodComparisonTransformedProps {
  const {
    width,
    height,
    formData,
    rawFormData,
    queriesData,
    hooks,
    filterState,
    ownState,
  } = chartProps;

  const fd = {
    ...DEFAULT_FORM_DATA,
    ...(formData as PeriodComparisonQueryFormData),
  };
  const raw = (rawFormData || {}) as PeriodComparisonQueryFormData;

  // ChartProps.formData is camelCased (comparisonGrain) while rawFormData
  // is snake_case (comparison_grain) — pick() reads both casings
  const grain = parseGrain(
    pick<string | undefined>(
      fd,
      "comparisonGrain",
      "comparison_grain",
      undefined,
    ),
  );
  const lineType = pick(fd, "lineType", "line_type", "polyline");
  const stepPosition = pick(fd, "stepPosition", "step_position", "start");
  const lineWidth = pickNumber(fd, "lineWidth", "line_width", 2, 0.5, 6);
  const markerSize = pickNumber(fd, "markerSize", "marker_size", 6, 0, 20);
  const showValues = pick(fd, "showValues", "show_values", false);
  const showExtremes = pick(fd, "showExtremes", "show_extremes", false);
  const area = pick(fd, "area", "area", false);
  const areaOpacity = pickNumber(
    fd,
    "areaOpacity",
    "area_opacity",
    0.3,
    0,
    1,
  );
  const yScale = pick(fd, "yScale", "y_scale", "linear");
  const showLegend = pick(fd, "showLegend", "show_legend", true);
  const showZoom = pick(fd, "showZoom", "show_zoom", false);
  const numberFormat = pick(fd, "numberFormat", "number_format", "SMART_NUMBER");
  const seriesStyles = pick<SeriesStyles | null>(
    fd,
    "seriesStyles",
    "series_styles",
    null,
  );
  const chartColors = pick<ChartColors | null>(
    fd,
    "chartColors",
    "chart_colors",
    null,
  );

  // On the dashboard ANY date/time filter reaching the chart changes the
  // period source (see resolvePeriodsSource). Same source as buildQuery.
  const ownStateBag = ownState as { periods?: unknown } | undefined;
  const extraFormData = (rawFormData as { extra_form_data?: unknown } | undefined)
    ?.extra_form_data;
  const { periods: resolvedPeriods, source: periodsSource } =
    resolvePeriodsSource(ownStateBag, fd.periods ?? raw.periods, extraFormData);
  const periods = normalizePeriods(resolvedPeriods);

  // the window actually applied by dashboard date filters (plaque + legend
  // suffix so series names never pretend to show unfiltered data)
  const appliedRange = extractAppliedDateRange(extraFormData);
  const appliedDateRangeLabel = appliedRange
    ? formatPeriodLabel(appliedRange)
    : undefined;
  const dateFilterSuffix =
    periodsSource === "date_filter" && appliedDateRangeLabel
      ? ` (${appliedDateRangeLabel})`
      : "";

  let statusKind: StatusKind = null;
  let echartOptions: Record<string, unknown> = {};
  let periodsLabel: string | undefined;

  const metric = fd.metric ?? raw.metric;
  const xAxis = ensureIsArray(fd.x_axis ?? raw.x_axis)[0];

  if (!metric) {
    statusKind = "no_metric";
  } else if (xAxis === null || xAxis === undefined || xAxis === "") {
    statusKind = "no_time_column";
  } else if (periods.length === 0) {
    statusKind = "no_periods";
    } else {
      const { periods: validated } = validatePeriods(periods);
      if (validated.length === 0) {
        statusKind = "no_periods";
      } else {
        periodsLabel = validated.map(formatPeriodLabel).join(", ");
        const timeColumn = getColumnLabel(xAxis) || "";
      const metricLabel = getMetricLabel(metric);
      const axisLength = Math.max(
        ...validated.map(period => periodBucketCount(period, grain)),
      );
      const seriesCount = validated.length;
      const scale = getScale(yScale);
      const numberFormatter = getNumberFormatter(numberFormat);
      const formatNumber = (value: number | null) =>
        value === null ? "—" : numberFormatter(value);
      const axisLabels = buildAxisLabels(
        grain,
        axisLength,
        validated[0],
      );
      const styles = seriesStyles || {};

      const series: Series[] = validated.map((period, index) => {
        const style = styles[String(index)];
        return buildSeries({
          rows: (queriesData?.[index]?.data as Record<string, unknown>[]) || [],
          period,
          grain,
          metricLabel,
          timeColumnLabel: timeColumn,
          axisLength,
          scale,
          name:
            style?.label ||
            `${formatPeriodLabel(period)}${dateFilterSuffix}`,
          color: style?.color || undefined,
          symbol: seriesSymbolFor(index, seriesCount, style),
          showSymbol: style?.markerEnabled !== false,
        });
      });

      if (!series.some(item => item.hasData)) {
        statusKind = "no_data";
      }

      echartOptions = buildEchartOptions({
        series,
        axisLabels,
        grain,
        lineType: lineType as "polyline" | "smooth" | "step",
        stepPosition: stepPosition as "start" | "middle" | "end",
        lineWidth,
        markerSize,
        showValues,
        showExtremes,
        area,
        areaOpacity,
        scale,
        showLegend,
        hideEmptyLegendEntries:
          periodsSource === "filter" || periodsSource === "date_filter",
        showZoom,
        gridColor: chartColors?.grid || undefined,
        axisColor: chartColors?.axis || undefined,
        formatNumber,
      });
    }
  }

  return {
    width,
    height,
    echartOptions,
    statusKind,
    periods,
    periodsSource,
    periodsLabel,
    appliedDateRangeLabel,
    timeColumn: getColumnLabel(xAxis) || "",
    grain,
    setDataMask: hooks?.setDataMask ?? noOp,
    filterState: filterState || {},
    formData: fd,
  };
}
