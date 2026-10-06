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
import { buildSeriesSetFromRows, type Series } from "./seriesData";
import {
  DEFAULT_FORM_DATA,
  type ChartColors,
  type PeriodComparisonQueryFormData,
  type PeriodComparisonTransformedProps,
  type SeriesStyles,
  type StatusKind,
} from "./types";

const GRAIN_LABEL: Record<ComparisonGrain, string> = {
  hour: "Hour",
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

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

type ChartSettings = ReturnType<typeof resolveSettings>;

/** Dual-casing (camel/snake) reads of every style/behavior control */
function resolveSettings(
  fd: PeriodComparisonQueryFormData,
  raw: PeriodComparisonQueryFormData,
): ChartSettings {
  return {
    grain: parseGrain(
      pick(fd, "comparisonGrain", "comparison_grain", undefined),
    ),
    lineType: pick(fd, "lineType", "line_type", "polyline"),
    stepPosition: pick(fd, "stepPosition", "step_position", "start"),
    lineWidth: pickNumber(fd, "lineWidth", "line_width", 2, 0.5, 6),
    markerSize: pickNumber(fd, "markerSize", "marker_size", 6, 0, 20),
    showValues: pick(fd, "showValues", "show_values", false),
    showExtremes: pick(fd, "showExtremes", "show_extremes", false),
    area: pick(fd, "area", "area", false),
    areaOpacity: pickNumber(fd, "areaOpacity", "area_opacity", 0.3, 0, 1),
    yScale: pick(fd, "yScale", "y_scale", "linear"),
    showLegend: pick(fd, "showLegend", "show_legend", true),
    showZoom: pick(fd, "showZoom", "show_zoom", false),
    numberFormat: pick(fd, "numberFormat", "number_format", "SMART_NUMBER"),
    seriesStyles: pick<SeriesStyles | null>(
      fd,
      "seriesStyles",
      "series_styles",
      null,
    ),
    chartColors: pick<ChartColors | null>(
      fd,
      "chartColors",
      "chart_colors",
      null,
    ),
  };
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

type SeriesSetArgs = {
  /** Rows of the single span query */
  rows: Record<string, unknown>[];
  validated: ReturnType<typeof validatePeriods>["periods"];
  grain: ComparisonGrain;
  settings: ChartSettings;
  axisLength: number;
  metricLabel: string;
  timeColumn: string;
  /** The window applied by dashboard date filters (null when none) */
  appliedRange?: { startMs: number; endMs: number } | null;
  /** True when a dashboard date filter governs the chart */
  narrowedByDateFilter?: boolean;
};

/** One aligned Series per validated period, styled by the per-line styles */
function buildSeriesSet({
  rows,
  validated,
  grain,
  settings,
  axisLength,
  metricLabel,
  timeColumn,
  appliedRange,
  narrowedByDateFilter,
}: SeriesSetArgs): Series[] {
  const seriesCount = validated.length;
  const scale = getScale(settings.yScale);
  const styles = settings.seriesStyles || {};
  const names: string[] = [];
  const colors: (string | undefined)[] = [];
  const symbols: string[] = [];
  const showSymbols: boolean[] = [];
  validated.forEach((period, index) => {
    const style = styles[String(index)];
    // under a dashboard date filter the legend names the range the line
    // actually shows: the period intersected with the applied window
    let name = style?.label || formatPeriodLabel(period);
    if (narrowedByDateFilter && appliedRange) {
      const start = Math.max(period.startMs, appliedRange.startMs);
      const end = Math.min(period.endMs + 1, appliedRange.endMs);
      if (end > start) {
        name = style?.label || formatPeriodLabel({ startMs: start, endMs: end });
      }
    }
    names.push(name);
    colors.push(style?.color || undefined);
    symbols.push(seriesSymbolFor(index, seriesCount, style));
    showSymbols.push(style?.markerEnabled !== false);
  });
  return buildSeriesSetFromRows({
    rows,
    validated,
    grain,
    metricLabel,
    timeColumnLabel: timeColumn,
    axisLength,
    scale,
    names,
    colors,
    symbols,
    showSymbols,
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
  const settings = resolveSettings(fd, raw);

  // On the dashboard ANY date/time filter reaching the chart changes the
  // period source (see resolvePeriodsSource). Same source as buildQuery.
  const ownStateBag = ownState as { periods?: unknown } | undefined;
  const extraFormData = (rawFormData as { extra_form_data?: unknown } | undefined)
    ?.extra_form_data;
  let { periods: resolvedPeriods, source: periodsSource } =
    resolvePeriodsSource(ownStateBag, fd.periods ?? raw.periods, extraFormData);

  // the window actually applied by dashboard date filters (plaque + the
  // legend name of the single narrowed line)
  const appliedRange = extractAppliedDateRange(extraFormData);
  const appliedDateRangeLabel = appliedRange
    ? formatPeriodLabel(appliedRange)
    : undefined;

  // a dashboard date filter REPLACES the periods with its own window —
  // one line spanning exactly what the filter selects (even while the
  // period_ranges filter is present but empty)
  if (periodsSource === "date_filter" && appliedRange) {
    resolvedPeriods = [
      {
        start: new Date(appliedRange.startMs).toISOString(),
        end: new Date(appliedRange.endMs - 1).toISOString(),
      },
    ];
  }
  const periods = normalizePeriods(resolvedPeriods);

  let statusKind: StatusKind = null;
  let echartOptions: Record<string, unknown> = {};
  let periodsLabel: string | undefined;

  const metric = fd.metric ?? raw.metric;
  const xAxis = ensureIsArray(fd.x_axis ?? raw.x_axis)[0];
  const timeColumn = getColumnLabel(xAxis) || "";

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
      const metricLabel = getMetricLabel(metric);
      const axisLength = Math.max(
        ...validated.map(period => periodBucketCount(period, settings.grain)),
      );
      const numberFormatter = getNumberFormatter(settings.numberFormat);
      const formatNumber = (value: number | null) =>
        value === null ? "—" : numberFormatter(value);
      const axisLabels = buildAxisLabels(
        settings.grain,
        axisLength,
        validated[0],
      );
      const series = buildSeriesSet({
        rows: (queriesData?.[0]?.data as Record<string, unknown>[]) || [],
        validated,
        grain: settings.grain,
        settings,
        axisLength,
        metricLabel,
        timeColumn,
        appliedRange,
        narrowedByDateFilter: periodsSource === "date_filter",
      });

      if (!series.some(item => item.hasData)) {
        statusKind = "no_data";
      }

      echartOptions = buildEchartOptions({
        series,
        axisLabels,
        grain: settings.grain,
        lineType: settings.lineType,
        stepPosition: settings.stepPosition,
        lineWidth: settings.lineWidth,
        markerSize: settings.markerSize,
        showValues: settings.showValues,
        showExtremes: settings.showExtremes,
        area: settings.area,
        areaOpacity: settings.areaOpacity,
        scale: getScale(settings.yScale),
        showLegend: settings.showLegend,
        hideEmptyLegendEntries:
          periodsSource === "filter" || periodsSource === "date_filter",
        showZoom: settings.showZoom,
        gridColor: settings.chartColors?.grid || undefined,
        axisColor: settings.chartColors?.axis || undefined,
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
    timeColumn,
    grain: settings.grain,
    setDataMask: hooks?.setDataMask ?? noOp,
    filterState: filterState || {},
    formData: fd,
  };
}
