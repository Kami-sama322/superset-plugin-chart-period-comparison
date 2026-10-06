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
  formatBucketDate,
  type ComparisonGrain,
} from "./periods";
import type { MarkerShape } from "./types";
import type { Series } from "./seriesData";
import type { Scale } from "./scale";

/**
 * Pure ECharts option builder. No echarts imports — the option tree is a
 * plain object so the module stays unit-testable; the runtime component
 * feeds it into echarts.
 */

export type MarkerShapeId =
  | "circle"
  | "rect"
  | "triangle"
  | "diamond"
  | "star";

/**
 * Five-point star as an SVG path — ECharts has no built-in star symbol.
 * Path is centered on (0,0) within a -0.5..0.5 box.
 */
export const STAR_SYMBOL =
  "path://M0,-0.5 L0.117,-0.162 L0.476,-0.155 L0.19,0.062 L0.294,0.405 L0,0.2 L-0.294,0.405 L-0.19,0.062 L-0.476,-0.155 L-0.117,-0.162 Z";

/**
 * Ordered marker palette: with several periods every line gets its own
 * node shape so the series stay distinguishable beyond color (5 shapes =
 * the 5 period limit, no collisions).
 */
export const SERIES_SYMBOLS: MarkerShapeId[] = [
  "circle",
  "rect",
  "triangle",
  "diamond",
  "star",
];

export const DEFAULT_PALETTE = [
  "#5470c6",
  "#91cc75",
  "#fac858",
  "#ee6666",
  "#73c0de",
];

export function symbolFor(shape: MarkerShapeId): string {
  return shape === "star" ? STAR_SYMBOL : shape;
}

/** Escape user-authored strings (series aliases) rendered as tooltip HTML */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only safe CSS color syntax may reach inline styles */
function safeColor(color: string | undefined | null): string | null {
  if (!color) {
    return null;
  }
  return /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\)|[a-zA-Z]+)$/.test(color.trim())
    ? color.trim()
    : null;
}

/**
 * Node symbol of a series:
 * - markers off → none (plain line, symbols only on hover);
 * - single series → the user-selected shape;
 * - multiple series → the fixed palette by series index.
 */
export function resolveSymbol(options: {
  index: number;
  seriesCount: number;
  showMarkers: boolean;
  markerShape: MarkerShapeId;
}): string {
  const { index, seriesCount, showMarkers, markerShape } = options;
  if (!showMarkers) {
    return "none";
  }
  if (seriesCount <= 1) {
    return symbolFor(markerShape);
  }
  return symbolFor(SERIES_SYMBOLS[index % SERIES_SYMBOLS.length]);
}

const MARKER_SHAPES = new Set<string>(SERIES_SYMBOLS);

function isMarkerShape(value: unknown): value is MarkerShapeId {
  return typeof value === "string" && MARKER_SHAPES.has(value);
}

/**
 * Per-line node symbol (the Colors and labels control):
 * - markers disabled on the line → none;
 * - explicit shape chosen → that shape;
 * - otherwise → the auto palette by series index (distinct shapes for
 *   distinct lines by default).
 */
export function seriesSymbolFor(
  index: number,
  seriesCount: number,
  style?: {
    markerEnabled?: boolean;
    markerShape?: MarkerShape | null;
  } | null,
): string {
  if (style?.markerEnabled === false) {
    return "none";
  }
  if (isMarkerShape(style?.markerShape)) {
    return symbolFor(style.markerShape);
  }
  return resolveSymbol({
    index,
    seriesCount,
    showMarkers: true,
    markerShape: "circle",
  });
}

export type ChartOptionsInput = {
  series: Series[];
  axisLabels: string[];
  grain: ComparisonGrain;
  lineType: "polyline" | "smooth" | "step";
  stepPosition: "start" | "middle" | "end";
  lineWidth: number;
  markerSize: number;
  showValues: boolean;
  showExtremes: boolean;
  area: boolean;
  areaOpacity: number;
  scale: Scale;
  showLegend: boolean;
  /** Hide fully-empty series from the legend (date-filter narrowing) */
  hideEmptyLegendEntries?: boolean;
  showZoom: boolean;
  gridColor?: string | null;
  axisColor?: string | null;
  /** Formats ORIGINAL (unscaled) values for labels/tooltip/axes */
  formatNumber: (value: number | null) => string;
};

export function buildEchartOptions(
  input: ChartOptionsInput,
): Record<string, unknown> {
  const {
    series,
    axisLabels,
    grain,
    lineType,
    stepPosition,
    lineWidth,
    markerSize,
    showValues,
    showExtremes,
    area,
    areaOpacity,
    scale,
    showLegend,
    hideEmptyLegendEntries,
    showZoom,
    gridColor,
    axisColor,
    formatNumber,
  } = input;

  const legendNames = hideEmptyLegendEntries
    ? series.filter(item => item.hasData).map(item => item.name)
    : series.map(item => item.name);
  // the legend stays whenever it has content: under a dashboard date
  // filter (or after periods are removed down to one) the single entry
  // names the range the line actually shows
  const hasLegendContent = legendNames.length > 0;

  const lineSeries = series.map((item, index) => {
    const color = item.color || DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
    const rawValues = item.rawValues;
    const valueLabel = (dataIndex: number) =>
      formatNumber(rawValues[dataIndex] ?? null);
    return {
      name: item.name,
      type: "line",
      data: item.values,
      smooth: lineType === "smooth",
      step: lineType === "step" ? stepPosition : undefined,
      symbol: item.symbol,
      showSymbol: item.showSymbol,
      symbolSize: markerSize,
      lineStyle: { width: lineWidth, color },
      itemStyle: { color },
      emphasis: { focus: "series" },
      connectNulls: false,
      ...(area ? { areaStyle: { color, opacity: areaOpacity } } : {}),
      ...(showValues
        ? {
            label: {
              show: true,
              position: "top",
              fontSize: 10,
              color: axisColor,
              formatter: (params: { dataIndex: number }) =>
                valueLabel(params.dataIndex),
            },
          }
        : {}),
      ...(showExtremes
        ? {
            markPoint: {
              symbolSize: markerSize + 8,
              itemStyle: { color },
              label: {
                show: true,
                position: "top",
                fontSize: 10,
                color: axisColor,
                formatter: (params: { dataIndex: number }) =>
                  valueLabel(params.dataIndex),
              },
              data: [{ type: "max" }, { type: "min" }],
            },
          }
        : {}),
    };
  });

  const tooltipFormatter = (params: unknown): string => {
    const list = (Array.isArray(params) ? params : [params]) as {
      dataIndex: number;
      seriesIndex: number;
    }[];
    if (!list.length) {
      return "";
    }
    const dataIndex = list[0].dataIndex;
    const rows = list
      .filter(point => point.seriesIndex < series.length)
      .map(point => {
        const item = series[point.seriesIndex];
        const bucketStart = item.bucketStarts[dataIndex] ?? null;
        const value = item.rawValues[dataIndex] ?? null;
        const date = formatBucketDate(bucketStart, grain);
        const dot = safeColor(
          item.color || DEFAULT_PALETTE[point.seriesIndex % DEFAULT_PALETTE.length],
        );
        return (
          `${dot ? markerDot(dot) : ""}` +
          `${escapeHtml(item.name)}: <b>${formatNumber(value)}</b> ` +
          `<span style="opacity:0.65">(${date})</span>`
        );
      });
    return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(
      axisLabels[dataIndex] ?? "",
    )}</div>${rows.join("<br/>")}`;
  };

  return {
    animationDuration: 300,
    color: series.map(
      (item, index) => item.color || DEFAULT_PALETTE[index % DEFAULT_PALETTE.length],
    ),
    legend: {
      show: showLegend && hasLegendContent,
      type: "scroll",
      top: 0,
      left: "center",
      data: legendNames,
      ...(axisColor ? { textStyle: { color: axisColor } } : {}),
    },
    grid: {
      top: showLegend && hasLegendContent ? 48 : 24,
      left: 8,
      right: 16,
      bottom: showZoom ? 56 : 8,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      formatter: tooltipFormatter,
    },
    xAxis: {
      type: "category",
      data: axisLabels,
      boundaryGap: lineType === "step",
      axisLine: { lineStyle: { color: axisColor } },
      axisTick: { show: false },
      axisLabel: {
        color: axisColor,
        hideOverlap: true,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: axisColor,
        formatter: (value: number) => formatNumber(scale.invert(value)),
      },
      splitLine: {
        show: true,
        lineStyle: { color: gridColor },
      },
    },
    ...(showZoom
      ? {
          dataZoom: [
            { type: "inside", xAxisIndex: 0 },
            {
              type: "slider",
              xAxisIndex: 0,
              height: 20,
              bottom: 10,
            },
          ],
        }
      : {}),
    series: lineSeries,
  };
}

function markerDot(color: string): string {
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${color};margin-right:6px"></span>`;
}

/** Theme tokens used to fill colors the controls did not set */
export type ChartThemeColors = {
  /** Primary text (tooltips background contrast) */
  text: string;
  /** Secondary text: axis labels, legend */
  textSecondary: string;
  /** Split / axis lines */
  line: string;
  /** Tooltip / legend surface */
  surface: string;
};

type ColorfulOption = {
  color?: string;
  lineStyle?: { color?: string };
  axisLabel?: { color?: string };
  axisLine?: { show?: boolean; lineStyle?: { color?: string } };
  splitLine?: { show?: boolean; lineStyle?: { color?: string } };
  textStyle?: { color?: string };
};

type AxisOption = ColorfulOption & {
  axisLabel?: ColorfulOption["axisLabel"];
  axisLine?: ColorfulOption["axisLine"];
  splitLine?: ColorfulOption["splitLine"];
};

/**
 * Fill the color paths the user left unset with theme tokens so the chart
 * stays readable in light and dark dashboards. Explicit control colors win.
 */
export function applyThemeColors(
  options: Record<string, unknown>,
  theme: ChartThemeColors,
): Record<string, unknown> {
  const next = { ...options };

  const legend = { ...(next.legend as ColorfulOption | undefined) };
  if (legend && !legend.textStyle?.color) {
    legend.textStyle = { ...legend.textStyle, color: theme.textSecondary };
  }
  next.legend = legend;

  const tooltip = { ...(next.tooltip as Record<string, unknown> | undefined) };
  if (!tooltip.backgroundColor) {
    tooltip.backgroundColor = theme.surface;
    tooltip.borderWidth = 0;
  }
  const textStyle = tooltip.textStyle as { color?: string } | undefined;
  if (!textStyle?.color) {
    tooltip.textStyle = { ...textStyle, color: theme.text };
  }
  next.tooltip = tooltip;

  (["xAxis", "yAxis"] as const).forEach(axisKey => {
    const axis = { ...((next[axisKey] as AxisOption | undefined) || {}) };
    if (axis.axisLabel && !axis.axisLabel.color) {
      axis.axisLabel = { ...axis.axisLabel, color: theme.textSecondary };
    }
    if (axis.axisLine && !axis.axisLine.lineStyle?.color) {
      axis.axisLine = {
        ...axis.axisLine,
        lineStyle: { ...axis.axisLine.lineStyle, color: theme.line },
      };
    }
    if (axis.splitLine && !axis.splitLine.lineStyle?.color) {
      axis.splitLine = {
        ...axis.splitLine,
        lineStyle: { ...axis.splitLine.lineStyle, color: theme.line },
      };
    }
    next[axisKey] = axis;
  });

  const themedSeries = ((next.series as Record<string, unknown>[]) || []).map(
    item => {
      const styled = { ...item };
      const label = styled.label as ColorfulOption | undefined;
      if (label && !label.color) {
        styled.label = { ...label, color: theme.textSecondary };
      }
      const markPoint = styled.markPoint as
        | { label?: ColorfulOption }
        | undefined;
      if (markPoint?.label && !markPoint.label.color) {
        styled.markPoint = {
          ...markPoint,
          label: { ...markPoint.label, color: theme.textSecondary },
        };
      }
      return styled;
    },
  );
  next.series = themedSeries;

  return next;
}
