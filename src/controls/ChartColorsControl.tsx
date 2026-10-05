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
import { useTheme } from "@apache-superset/core/theme";
import { t } from "@apache-superset/core/translation";
import { ColorPicker, type ColorValue } from "@superset-ui/core/components";
import { ControlHeader } from "@superset-ui/chart-controls";
import { colorToHex } from "./colorToHex";
import type { ChartColors } from "../types";

type Props = {
  value?: ChartColors | null;
  onChange?: (value: ChartColors) => void;
  label?: string;
  description?: string;
  name?: string;
};

/** Grid and axis colors; cleared pickers fall back to the dashboard theme */
export default function ChartColorsControl({
  value,
  onChange,
  ...headerProps
}: Props) {
  const theme = useTheme();
  const colors = value || {};

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.sizeUnit,
            minHeight: 28,
          }}
        >
          <span style={{ flex: "1 1 auto" }}>{t("Grid")}</span>
          <ColorPicker
            size="small"
            value={colors.grid || undefined}
            allowClear
            onClear={() => onChange?.({ ...colors, grid: null })}
            onChangeComplete={(color: ColorValue) =>
              onChange?.({ ...colors, grid: colorToHex(color) })
            }
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.sizeUnit,
            minHeight: 28,
          }}
        >
          <span style={{ flex: "1 1 auto" }}>{t("Axis")}</span>
          <ColorPicker
            size="small"
            value={colors.axis || undefined}
            allowClear
            onClear={() => onChange?.({ ...colors, axis: null })}
            onChangeComplete={(color: ColorValue) =>
              onChange?.({ ...colors, axis: colorToHex(color) })
            }
          />
        </div>
        <div style={{ color: theme.colorTextSecondary, fontSize: 12 }}>
          {t("Clear a color to use the dashboard theme")}
        </div>
      </div>
    </div>
  );
}
