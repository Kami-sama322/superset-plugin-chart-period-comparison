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
  Behavior,
  FilterState,
  QueryFormData,
  QueryFormColumn,
  QueryFormMetric,
  SetDataMaskHook,
} from "@superset-ui/core";
import type { ComparisonGrain, PeriodRange } from "./periods";

export type { ComparisonGrain, PeriodRange } from "./periods";

export type LineType = "polyline" | "smooth" | "step";
export type StepPosition = "start" | "middle" | "end";
export type MarkerShape = "circle" | "rect" | "triangle" | "diamond" | "star";
export type YScaleType = "linear" | "sqrt" | "log" | "power2";

export type StatusKind =
  | "no_metric"
  | "no_time_column"
  | "no_periods"
  | "no_data"
  | null;

/** Per-series override keyed by the period index ("0".."4") */
export type SeriesStyle = {
  /** Legend alias; empty/undefined = formatted date range */
  label?: string | null;
  /** Line color; empty/undefined = categorical palette by index */
  color?: string | null;
  /** Node markers on this line; default true */
  markerEnabled?: boolean;
  /** Node symbol; empty/undefined = auto (distinct palette by index) */
  markerShape?: MarkerShape | null;
};

export type SeriesStyles = Record<string, SeriesStyle> | null;

export type ChartColors = {
  grid?: string | null;
  axis?: string | null;
};

export type PeriodComparisonQueryFormData = QueryFormData & {
  metric?: QueryFormMetric;
  /** Temporal column (shared `x_axis` control) */
  x_axis?: QueryFormColumn;
  comparison_grain?: ComparisonGrain;
  periods?: PeriodRange[] | null;
  row_limit?: number;
  number_format?: string;

  line_type?: LineType;
  lineType?: LineType;
  step_position?: StepPosition;
  stepPosition?: StepPosition;
  line_width?: number;
  lineWidth?: number;
  /** Applies to every enabled marker (per-line toggles in SeriesStyle) */
  marker_size?: number;
  markerSize?: number;
  show_values?: boolean;
  showValues?: boolean;
  show_extremes?: boolean;
  showExtremes?: boolean;
  area?: boolean;
  area_opacity?: number;
  areaOpacity?: number;
  y_scale?: YScaleType;
  yScale?: YScaleType;
  show_legend?: boolean;
  showLegend?: boolean;
  show_zoom?: boolean;
  showZoom?: boolean;
  series_styles?: SeriesStyles | null;
  seriesStyles?: SeriesStyles | null;
  chart_colors?: ChartColors | null;
  chartColors?: ChartColors | null;
};

export type SeriesData = {
  name: string;
  color?: string;
  symbol: string;
  /** Transformed values aligned to the shared relative axis (null = gap) */
  values: (number | null)[];
  /** Original values, same indexing as `values` */
  rawValues: (number | null)[];
  /** UTC epoch ms of every bucket start of this period (tooltip dates) */
  bucketStarts: (number | null)[];
  hasData: boolean;
};

export type PeriodComparisonTransformedProps = {
  width: number;
  height: number;
  echartOptions: Record<string, unknown>;
  statusKind: StatusKind;
  /** Raw period ranges for the on-chart pickers */
  periods: PeriodRange[];
  /** Where the rendered periods come from (drives the toolbar visibility) */
  periodsSource: "filter" | "date_filter" | "own" | "config";
  /** Formatted labels of the rendered periods ("05.01–09.01.2026, …") */
  periodsLabel?: string;
  /** The window actually applied by dashboard date filters ("06.01–07.01.2026") */
  appliedDateRangeLabel?: string;
  timeColumn: string;
  grain: ComparisonGrain;
  setDataMask: SetDataMaskHook;
  filterState: FilterState;
  formData: PeriodComparisonQueryFormData;
};

export const DEFAULT_FORM_DATA: Partial<PeriodComparisonQueryFormData> = {
  comparison_grain: "day",
  periods: [],
  row_limit: 10000,
  number_format: "SMART_NUMBER",
  line_type: "polyline",
  step_position: "start",
  line_width: 2,
  marker_size: 6,
  show_values: false,
  show_extremes: false,
  area: false,
  area_opacity: 0.3,
  y_scale: "linear",
  show_legend: true,
  show_zoom: false,
  series_styles: null,
  chart_colors: null,
};
