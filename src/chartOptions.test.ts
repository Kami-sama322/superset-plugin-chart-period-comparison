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
import {
  applyThemeColors,
  buildEchartOptions,
  DEFAULT_PALETTE,
  resolveSymbol,
  seriesSymbolFor,
  SERIES_SYMBOLS,
  STAR_SYMBOL,
  symbolFor,
} from "./chartOptions";
import { getScale } from "./scale";
import type { Series } from "./seriesData";

const series = (values: (number | null)[]): Series => ({
  name: "s",
  symbol: "circle",
  showSymbol: true,
  values,
  rawValues: values,
  bucketStarts: values.map((_, index) => Date.UTC(2026, 0, 5 + index)),
  hasData: values.some(v => v !== null),
});

const baseInput = {
  series: [series([1, 2, 3])],
  axisLabels: ["Day 1", "Day 2", "Day 3"],
  grain: "day" as const,
  lineType: "polyline" as const,
  stepPosition: "start" as const,
  lineWidth: 2,
  markerSize: 6,
  showValues: false,
  showExtremes: false,
  area: false,
  areaOpacity: 0.3,
  scale: getScale("linear"),
  showLegend: true,
  showZoom: false,
  formatNumber: (v: number | null) => (v === null ? "—" : String(v)),
};

test("markers off produce plain lines", () => {
  expect(resolveSymbol({ index: 0, seriesCount: 3, showMarkers: false, markerShape: "circle" })).toBe("none");
});

test("per-line markers: off, explicit shape, or the auto palette", () => {
  expect(
    seriesSymbolFor(0, 3, { markerEnabled: false }),
  ).toBe("none");
  expect(
    seriesSymbolFor(0, 3, { markerEnabled: true, markerShape: "triangle" }),
  ).toBe("triangle");
  // auto: distinct shapes by index, regardless of a single or multiple lines
  expect(seriesSymbolFor(0, 5, {})).toBe("circle");
  expect(seriesSymbolFor(1, 5, {})).toBe("rect");
  expect(seriesSymbolFor(4, 5, {})).toBe(STAR_SYMBOL);
  // undefined style (no overrides) behaves like auto
  expect(seriesSymbolFor(2, 5, undefined)).toBe("triangle");
  // a garbage shape from hand-edited form data falls back to auto
  expect(
    seriesSymbolFor(3, 5, {
      markerEnabled: true,
      markerShape: "pentagon" as never,
    }),
  ).toBe("diamond");
});

test("a single series uses the selected marker shape", () => {
  expect(resolveSymbol({ index: 0, seriesCount: 1, showMarkers: true, markerShape: "triangle" })).toBe("triangle");
});

test("multiple series get distinct node symbols from the fixed palette", () => {
  const symbols = [0, 1, 2, 3, 4].map(index =>
    resolveSymbol({ index, seriesCount: 5, showMarkers: true, markerShape: "circle" }),
  );
  expect(symbols).toEqual([
    "circle",
    "rect",
    "triangle",
    "diamond",
    STAR_SYMBOL,
  ]);
  expect(new Set(symbols).size).toBe(5);
  expect(SERIES_SYMBOLS).toHaveLength(5);
});

test("the star shape maps to an SVG path symbol", () => {
  expect(symbolFor("star")).toBe(STAR_SYMBOL);
  expect(symbolFor("circle")).toBe("circle");
});

test("the option tree carries series data, colors and axes", () => {
  const options = buildEchartOptions(baseInput);
  const seriesOption = (options.series as Record<string, unknown>[])[0];
  expect(seriesOption.type).toBe("line");
  expect(seriesOption.data).toEqual([1, 2, 3]);
  expect(seriesOption.smooth).toBe(false);
  expect(seriesOption.showSymbol).toBe(true);
  expect((seriesOption.lineStyle as Record<string, unknown>).width).toBe(2);
  expect(options.color).toEqual([DEFAULT_PALETTE[0]]);
  const xAxis = options.xAxis as Record<string, unknown>;
  expect(xAxis.data).toEqual(["Day 1", "Day 2", "Day 3"]);
});

test("line styles follow the controls", () => {
  const smooth = buildEchartOptions({ ...baseInput, lineType: "smooth" });
  expect((smooth.series as Record<string, unknown>[])[0].smooth).toBe(true);

  const stepped = buildEchartOptions({
    ...baseInput,
    lineType: "step",
    stepPosition: "middle",
  });
  expect((stepped.series as Record<string, unknown>[])[0].step).toBe("middle");
});

test("area, labels and mark points appear only when enabled", () => {
  const plain = buildEchartOptions(baseInput);
  expect((plain.series as Record<string, unknown>[])[0].areaStyle).toBeUndefined();
  expect((plain.series as Record<string, unknown>[])[0].label).toBeUndefined();
  expect((plain.series as Record<string, unknown>[])[0].markPoint).toBeUndefined();

  const decorated = buildEchartOptions({
    ...baseInput,
    area: true,
    areaOpacity: 0.5,
    showValues: true,
    showExtremes: true,
  });
  const item = decorated.series as Record<string, unknown>[];
  expect(item[0].areaStyle).toEqual({ color: DEFAULT_PALETTE[0], opacity: 0.5 });
  expect(item[0].label).toBeDefined();
  expect(item[0].markPoint).toBeDefined();
  expect((item[0].markPoint as Record<string, unknown>).data).toEqual([
    { type: "max" },
    { type: "min" },
  ]);
});

test("the y axis formats inverted values so ticks show original numbers", () => {
  const options = buildEchartOptions({
    ...baseInput,
    scale: getScale("log"),
  });
  const yAxis = options.yAxis as Record<string, unknown>;
  const axisLabel = yAxis.axisLabel as Record<string, unknown>;
  const formatter = axisLabel.formatter as (v: number) => string;
  expect(formatter(3)).toBe("1000");
});

test("the tooltip lists every series with original values and real dates", () => {
  const options = buildEchartOptions({
    ...baseInput,
    series: [series([10, null, 30]), series([5, 6, null])],
  });
  const tooltip = options.tooltip as Record<string, unknown>;
  const formatter = tooltip.formatter as (params: unknown) => string;
  const html = formatter([
    { dataIndex: 0, seriesIndex: 0 },
    { dataIndex: 0, seriesIndex: 1 },
  ]);
  expect(html).toContain("Day 1");
  expect(html).toContain("10");
  expect(html).toContain("05.01.2026");

  const gapHtml = formatter([
    { dataIndex: 1, seriesIndex: 0 },
    { dataIndex: 1, seriesIndex: 1 },
  ]);
  expect(gapHtml).toContain("—");
  expect(gapHtml).toContain("6");
});

test("legend stays for a single series; zoom is optional", () => {
  // a single line keeps its legend: its name names the range it shows
  // (dashboard date filter, or periods removed down to one)
  const single = buildEchartOptions(baseInput);
  expect((single.legend as Record<string, unknown>).show).toBe(true);
  expect((single.legend as Record<string, unknown>).data).toEqual(["s"]);
  expect(
    (buildEchartOptions({ ...baseInput, series: [series([1]), series([2])] })
      .legend as Record<string, unknown>).show,
  ).toBe(true);

  // hideEmptyLegendEntries drops series without data from the legend
  const narrowed = buildEchartOptions({
    ...baseInput,
    series: [series([1]), series([null])],
    hideEmptyLegendEntries: true,
  });
  expect((narrowed.legend as Record<string, unknown>).data).toEqual(["s"]);
  // and hides the legend entirely when nothing has data
  const allEmpty = buildEchartOptions({
    ...baseInput,
    series: [series([null])],
    hideEmptyLegendEntries: true,
  });
  expect((allEmpty.legend as Record<string, unknown>).show).toBe(false);

  const zoomed = buildEchartOptions({ ...baseInput, showZoom: true });
  expect(Array.isArray(zoomed.dataZoom)).toBe(true);

  const legendOff = buildEchartOptions({
    ...baseInput,
    series: [series([1]), series([2])],
    showLegend: false,
  });
  expect((legendOff.legend as Record<string, unknown>).show).toBe(false);
});

test("applyThemeColors fills unset colors and keeps explicit ones", () => {
  const themed = applyThemeColors(
    buildEchartOptions({ ...baseInput, axisColor: undefined, gridColor: undefined }),
    {
      text: "#111111",
      textSecondary: "#222222",
      line: "#333333",
      surface: "#444444",
    },
  );
  const themedXAxis = themed.xAxis as {
    axisLabel: { color: string };
    axisLine: { lineStyle: { color: string } };
  };
  expect(themedXAxis.axisLabel.color).toBe("#222222");
  expect(themedXAxis.axisLine.lineStyle.color).toBe("#333333");
  const themedYAxis = themed.yAxis as {
    splitLine: { lineStyle: { color: string } };
  };
  expect(themedYAxis.splitLine.lineStyle.color).toBe("#333333");
  const themedTooltip = themed.tooltip as Record<string, unknown>;
  expect(themedTooltip.backgroundColor).toBe("#444444");
  expect(
    (themedTooltip.textStyle as { color: string }).color,
  ).toBe("#111111");
  // series node labels get the secondary text color
  expect(
    (themed.series as Record<string, unknown>[])[0].label,
  ).toBeUndefined(); // showValues is off in baseInput

  const explicit = applyThemeColors(
    buildEchartOptions({
      ...baseInput,
      axisColor: "#ff0000",
      gridColor: "#00ff00",
      showValues: true,
      series: [series([1]), series([2])],
    }),
    {
      text: "#111111",
      textSecondary: "#222222",
      line: "#333333",
      surface: "#444444",
    },
  );
  const explicitXAxis = explicit.xAxis as {
    axisLabel: { color: string };
    axisLine: { lineStyle: { color: string } };
  };
  expect(explicitXAxis.axisLabel.color).toBe("#ff0000");
  expect(explicitXAxis.axisLine.lineStyle.color).toBe("#ff0000");
  const explicitYAxis = explicit.yAxis as {
    splitLine: { lineStyle: { color: string } };
  };
  expect(explicitYAxis.splitLine.lineStyle.color).toBe("#00ff00");
  const explicitSeries = explicit.series as {
    label: { color: string };
  }[];
  expect(explicitSeries[0].label.color).toBe("#ff0000");
  expect(
    (explicit.legend as { textStyle: { color: string } }).textStyle.color,
  ).toBe("#ff0000");
});

test("tooltip escapes user-authored series names", () => {
  const hostile: Series = {
    name: '<img src=x onerror="alert(1)">',
    symbol: "circle",
    values: [1],
    rawValues: [1],
    bucketStarts: [Date.UTC(2026, 0, 5)],
    hasData: true,
  };
  const options = buildEchartOptions({
    ...baseInput,
    series: [hostile],
  });
  const tooltip = options.tooltip as Record<string, unknown>;
  const formatter = tooltip.formatter as (params: unknown) => string;
  const html = formatter([{ dataIndex: 0, seriesIndex: 0 }]);
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;img");
});

test("legend hides fully-empty series when a date filter narrows the chart", () => {
  const withEmpty = buildEchartOptions({
    ...baseInput,
    series: [series([10, null, 30]), series([null, null, null])],
    hideEmptyLegendEntries: true,
  });
  const legend = withEmpty.legend as Record<string, unknown>;
  expect(legend.data).toEqual(["s"]);

  const keepAll = buildEchartOptions({
    ...baseInput,
    series: [series([10, null, 30]), series([null, null, null])],
  });
  expect((keepAll.legend as Record<string, unknown>).data).toEqual(["s", "s"]);
});
