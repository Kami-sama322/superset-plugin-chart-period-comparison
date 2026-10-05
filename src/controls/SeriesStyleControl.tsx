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
import { useTheme } from "@apache-superset/core/theme";
import { ColorPicker, type ColorValue } from "@superset-ui/core/components";
import { ControlHeader } from "@superset-ui/chart-controls";
import { Button, Input, Select, Switch } from "antd";
import { colorToHex } from "./colorToHex";
import { SERIES_SYMBOLS, type MarkerShapeId } from "../chartOptions";
import { MAX_PERIODS } from "../periods";
import type { SeriesStyle, SeriesStyles } from "../types";

type Props = {
  value?: SeriesStyles | null;
  onChange?: (value: SeriesStyles) => void;
  /** Number of configured periods (from the Periods control) */
  periodCount?: number;
  /** Default legend labels (formatted date ranges) */
  defaultLabels?: string[];
  label?: string;
  description?: string;
  name?: string;
};

const SHAPE_OPTIONS: { label: string; value: MarkerShapeId }[] = [
  { label: t("Circle"), value: "circle" },
  { label: t("Square"), value: "rect" },
  { label: t("Triangle"), value: "triangle" },
  { label: t("Diamond"), value: "diamond" },
  { label: t("Star"), value: "star" },
];

const SHAPE_LABEL = new Map(SHAPE_OPTIONS.map(o => [o.value, o.label]));

/** Placeholder of the shape select = the auto (distinct-by-index) shape */
const autoShapeLabel = (index: number) =>
  SHAPE_LABEL.get(SERIES_SYMBOLS[index % SERIES_SYMBOLS.length]) || "";

/**
 * Per-line appearance: node marker (switchable off, shape auto or explicit),
 * legend alias and line color. Cleared inputs fall back to the automatic
 * values — distinct palette shapes/colors and the formatted date range.
 */
export default function SeriesStyleControl({
  value,
  onChange,
  periodCount = 0,
  defaultLabels = [],
  ...headerProps
}: Props) {
  const theme = useTheme();
  const styles: Record<string, SeriesStyle> = { ...(value || {}) };

  const emit = (index: number, patch: SeriesStyle) => {
    onChange?.({
      ...styles,
      [String(index)]: { ...styles[String(index)], ...patch },
    });
  };

  const rows = Array.from(
    { length: Math.min(Math.max(periodCount, 0), MAX_PERIODS) },
    (_, index) => index,
  );

  return (
    <div>
      <ControlHeader {...headerProps} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: theme.sizeUnit,
        }}
      >
        {rows.map(index => {
          const style = styles[String(index)] || {};
          const markerEnabled = style.markerEnabled !== false;
          return (
            <div
              key={index}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: theme.sizeUnit / 2,
                padding: theme.sizeUnit / 2,
                border: `1px solid ${theme.colorBorderSecondary}`,
                borderRadius: theme.borderRadius,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: theme.sizeUnit,
                }}
              >
                <Switch
                  size="small"
                  checked={markerEnabled}
                  aria-label={t("Markers on line %(index)s", {
                    index: index + 1,
                  })}
                  onChange={checked =>
                    emit(index, { markerEnabled: checked })
                  }
                />
                <Select<MarkerShapeId>
                  size="small"
                  style={{ flex: "1 1 110px", minWidth: 110 }}
                  disabled={!markerEnabled}
                  allowClear
                  aria-label={t("Marker shape on line %(index)s", {
                    index: index + 1,
                  })}
                  value={
                    markerEnabled && style.markerShape
                      ? style.markerShape
                      : undefined
                  }
                  placeholder={t("Auto: %(shape)s", {
                    shape: autoShapeLabel(index),
                  })}
                  options={SHAPE_OPTIONS}
                  onChange={shape => emit(index, { markerShape: shape })}
                  onClear={() => emit(index, { markerShape: null })}
                />
                <ColorPicker
                  size="small"
                  value={style.color || undefined}
                  allowClear
                  onClear={() => emit(index, { color: null })}
                  onChangeComplete={(color: ColorValue) =>
                    emit(index, { color: colorToHex(color) })
                  }
                />
              </div>
              <Input
                size="small"
                placeholder={
                  defaultLabels[index] || t("Period %(index)s", { index: index + 1 })
                }
                value={style.label || ""}
                aria-label={t("Series %(index)s legend alias", {
                  index: index + 1,
                })}
                onChange={event =>
                  emit(index, { label: event.target.value })
                }
              />
            </div>
          );
        })}
        {rows.length === 0 ? (
          <span style={{ color: theme.colorTextSecondary, fontSize: 12 }}>
            {t("Add periods in the Periods control first")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
