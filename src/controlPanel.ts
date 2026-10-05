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
import { t } from "@apache-superset/core/translation";
import {
  ControlPanelConfig,
  ControlPanelsContainerProps,
  D3_FORMAT_DOCS,
  D3_FORMAT_OPTIONS,
  DEFAULT_NUMBER_FORMAT,
  sharedControls,
} from "@superset-ui/chart-controls";
import PeriodsControl from "./controls/PeriodsControl";
import SeriesStyleControl from "./controls/SeriesStyleControl";
import ChartColorsControl from "./controls/ChartColorsControl";
import { formatPeriodLabel, validatePeriods } from "./periods";
import { DEFAULT_FORM_DATA } from "./types";

const whenStep = ({ controls }: ControlPanelsContainerProps) =>
  controls?.line_type?.value === "step";

const whenArea = ({ controls }: ControlPanelsContainerProps) =>
  Boolean(controls?.area?.value);

/** Number of periods configured in the Periods control (raw snake_case) */
const periodCountOf = (state: {
  form_data?: { periods?: unknown };
}): number => {
  const list = state.form_data?.periods;
  return Array.isArray(list) ? list.length : 0;
};

const seriesStyleMapStateToProps = (state: {
  form_data?: { periods?: unknown };
}) => {
  const { periods: validated } = validatePeriods(state.form_data?.periods);
  return {
    periodCount: periodCountOf(state),
    defaultLabels: validated.map(formatPeriodLabel),
  };
};

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t("Query"),
      expanded: true,
      controlSetRows: [
        [
          {
            name: "metric",
            config: {
              ...sharedControls.metric,
              label: t("Metric"),
              description: t(
                "The single metric compared across all periods",
              ),
              validators: [],
            },
          },
        ],
        [
          {
            name: "x_axis",
            config: {
              ...sharedControls.x_axis,
              label: t("Time column"),
              description: t(
                "Temporal column the periods and the comparison grain are applied to",
              ),
            },
          },
        ],
        [
          {
            name: "comparison_grain",
            config: {
              type: "SelectControl",
              label: t("Compare by"),
              description: t(
                "Bucket granularity used to align the periods with each other on the relative X axis",
              ),
              renderTrigger: false,
              default: DEFAULT_FORM_DATA.comparison_grain,
              clearable: false,
              options: [
                { label: t("Hours"), value: "hour" },
                { label: t("Days"), value: "day" },
                { label: t("Weeks"), value: "week" },
                { label: t("Months"), value: "month" },
                { label: t("Quarters"), value: "quarter" },
                { label: t("Years"), value: "year" },
              ],
            },
          },
        ],
        ["adhoc_filters"],
        [
          {
            name: "row_limit",
            config: {
              ...sharedControls.row_limit,
              default: DEFAULT_FORM_DATA.row_limit,
            },
          },
        ],
      ],
    },
    {
      label: t("Periods"),
      expanded: true,
      controlSetRows: [
        [
          {
            name: "periods",
            config: {
              type: PeriodsControl,
              label: t("Periods"),
              description: t(
                "1–5 date ranges of equal length. On the dashboard the same calendar filter is rendered on the chart itself; here you set the defaults. The date filter cross-filters the whole dashboard.",
              ),
              renderTrigger: false,
              default: null,
            },
          },
        ],
      ],
    },
    {
      label: t("Chart Options"),
      expanded: true,
      controlSetRows: [
        [
          {
            name: "line_type",
            config: {
              type: "RadioButtonControl",
              label: t("Line type"),
              renderTrigger: true,
              default: DEFAULT_FORM_DATA.line_type,
              options: [
                { label: t("Polyline"), value: "polyline" },
                { label: t("Smooth"), value: "smooth" },
                { label: t("Step"), value: "step" },
              ],
            },
          },
        ],
        [
          {
            name: "step_position",
            config: {
              type: "SelectControl",
              label: t("Step position"),
              renderTrigger: true,
              default: DEFAULT_FORM_DATA.step_position,
              clearable: false,
              visibility: whenStep,
              options: [
                { label: t("Start"), value: "start" },
                { label: t("Middle"), value: "middle" },
                { label: t("End"), value: "end" },
              ],
            },
          },
        ],
      ],
    },
    {
      // spoiler 1
      label: t("Line display"),
      expanded: false,
      controlSetRows: [
        [
          {
            name: "line_width",
            config: {
              type: "SliderControl",
              label: t("Line width"),
              description: t("Line thickness in pixels"),
              renderTrigger: true,
              min: 0.5,
              max: 6,
              step: 0.5,
              default: DEFAULT_FORM_DATA.line_width,
            },
          },
        ],
        [
          {
            name: "show_values",
            config: {
              type: "CheckboxControl",
              label: t("Show values on nodes"),
              renderTrigger: true,
              default: DEFAULT_FORM_DATA.show_values,
            },
          },
        ],
        [
          {
            name: "show_extremes",
            config: {
              type: "CheckboxControl",
              label: t("Show extremes"),
              description: t(
                "Mark the minimum and the maximum of every series",
              ),
              renderTrigger: true,
              default: DEFAULT_FORM_DATA.show_extremes,
            },
          },
        ],
        [
          {
            name: "area",
            config: {
              type: "CheckboxControl",
              label: t("Fill area"),
              renderTrigger: true,
              default: DEFAULT_FORM_DATA.area,
            },
          },
        ],
        [
          {
            name: "area_opacity",
            config: {
              type: "SliderControl",
              label: t("Area opacity"),
              renderTrigger: true,
              min: 0,
              max: 1,
              step: 0.05,
              default: DEFAULT_FORM_DATA.area_opacity,
              visibility: whenArea,
            },
          },
        ],
      ],
    },
    {
      // spoiler 2
      label: t("Scale, legend and zoom"),
      expanded: false,
      controlSetRows: [
        [
          {
            name: "y_scale",
            config: {
              type: "SelectControl",
              label: t("Y-axis scale"),
              description: t(
                "Non-linear scales smooth out the difference between very large and very small values. Logarithmic skips non-positive values, square root skips negative ones.",
              ),
              renderTrigger: true,
              default: DEFAULT_FORM_DATA.y_scale,
              clearable: false,
              options: [
                { label: t("Linear"), value: "linear" },
                { label: t("Square root"), value: "sqrt" },
                { label: t("Logarithmic"), value: "log" },
                { label: t("Quadratic (power 2)"), value: "power2" },
              ],
            },
          },
        ],
        [
          {
            name: "show_legend",
            config: {
              type: "CheckboxControl",
              label: t("Show legend"),
              renderTrigger: true,
              default: DEFAULT_FORM_DATA.show_legend,
            },
          },
        ],
        [
          {
            name: "show_zoom",
            config: {
              type: "CheckboxControl",
              label: t("Zoom slider"),
              renderTrigger: true,
              default: DEFAULT_FORM_DATA.show_zoom,
            },
          },
        ],
        [
          {
            name: "chart_colors",
            config: {
              type: ChartColorsControl,
              label: t("Grid and axis colors"),
              description: t(
                "Clear a color to fall back to the dashboard theme",
              ),
              renderTrigger: true,
              default: null,
            },
          },
        ],
      ],
    },
    {
      // spoiler 3
      label: t("Colors and labels"),
      expanded: false,
      controlSetRows: [
        [
          {
            name: "series_styles",
            config: {
              type: SeriesStyleControl,
              label: t("Series colors and labels"),
              description: t(
                "Per line: node markers (can be disabled, shape auto or explicit), a legend alias and the color. Cleared inputs fall back to the automatic values — distinct palette shapes/colors and the formatted date range.",
              ),
              renderTrigger: true,
              default: null,
              shouldMapStateToProps: () => true,
              mapStateToProps: seriesStyleMapStateToProps,
            },
          },
        ],
        [
          {
            name: "marker_size",
            config: {
              type: "SliderControl",
              label: t("Marker size"),
              description: t("Applies to every enabled marker"),
              renderTrigger: true,
              min: 2,
              max: 20,
              step: 1,
              default: DEFAULT_FORM_DATA.marker_size,
            },
          },
        ],
        [
          {
            name: "number_format",
            config: {
              type: "SelectControl",
              label: t("Number format"),
              description: D3_FORMAT_DOCS,
              renderTrigger: true,
              default: DEFAULT_NUMBER_FORMAT,
              choices: D3_FORMAT_OPTIONS,
              tokenSeparators: ["\n", "\t", ";"],
            },
          },
        ],
      ],
    },
  ],
};

export default config;
