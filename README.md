# Period Comparison — Apache Superset Chart Plugin

Chart plugin for **Apache Superset 6.1.0**: compare one metric over up to **5
arbitrary date ranges** on a single chart with a relative X axis, an on-chart
date filter that cross-filters the whole dashboard, rich line customization
and vertical scale functions.

![Period Comparison](images/thumbnail.png)

## What it does

- **Own date filter on the chart** — 1–5 calendar range pickers rendered on
  the chart surface (default values come from the control panel). Changing a
  range re-queries the chart itself and emits a cross-filter.
- **Cross-filtering** — the date filter emits a single `TEMPORAL_RANGE`
  clause covering the span of all periods (`min(start) : max(end)`), so every
  other chart on the dashboard is filtered by the compared time window.
- **Arbitrary, equal-length periods** — e.g. Mon–Fri of this week vs Tue–Sat
  two weeks ago. Periods of different lengths are rejected by validation.
- **Compare by** hours / days / weeks / months / quarters / years — the
  comparison grain buckets the data inside every period.
- **Relative X axis** — lines are aligned by relative position inside the
  period ("Day 1…N"); the tooltip shows the real date of every series.
- **Corner cases** — week/month/year bucket counts are computed per period
  start (a year compared by weeks yields 52–53 buckets, shorter series get
  gaps, empty buckets are rendered as gaps, not zeros).
- **Y-axis scale** — linear, square root, logarithmic, quadratic (power 2) to
  smooth out very large vs very small values. Axis ticks and labels show the
  original numbers; logarithmic scale skips non-positive values.
- **Line customization** — polyline / smooth / step (start|middle|end),
  area fill with opacity, values on nodes, min/max extremes. Collapsed
  sections: **Line display** (line width, node values, extremes, area) and
  **Scale, legend and zoom** (Y-axis scale, legend, zoom slider, grid and
  axis colors — resettable to the dashboard theme).
- **Per-line markers and colors** — in the collapsed *Colors and labels*
  section every line gets a marker switch (off / auto shape / explicit
  circle, square, triangle, diamond or star — auto keeps a distinct shape
  per line), a legend alias and a color; cleared inputs fall back to the
  automatic values. Marker size and the D3 number format live there too.
- Single metric, single time column — no series breakdown by design.

## Requirements

- Apache Superset **6.1.0**
- Node.js 22 (Superset frontend build)
- Runtime deps shipped with the plugin: `dayjs`, `echarts` (both already
  present in the Superset frontend)

## Install into Superset (local)

```bash
./install.sh /path/to/superset
cd /path/to/superset/superset-frontend
npm install
npm run dev-server
```

`install.sh` (idempotent):

1. Copies the package to `superset-frontend/plugins/plugin-chart-period-comparison/`.
2. Registers it in `src/setup/setupPluginsExtra.ts`
   (`key: 'chart_period_comparison'`).
3. Adds the `file:` dependency to `superset-frontend/package.json`
   (anchor: `plugin-chart-word-cloud`).

Verify: **Charts → + Chart → Period Comparison**.

## Configure a chart

1. **Query**: pick the metric (one), the time column, *Compare by* grain,
   optional filters and row limit.
2. **Periods**: add 1–5 ranges of equal length (date-only picking; the last
   day is inclusive). This defines the defaults.
3. **Chart Options**: line type (step position appears for step lines).
4. Collapsed sections: **Line display** (width, node values, extremes,
   area), **Scale, legend and zoom** (Y scale, legend, zoom, grid/axis
   colors), **Colors and labels** (per-line marker / alias / color, marker
   size, number format).

## On the dashboard

- The chart renders the same range pickers on its toolbar. Change any range —
  the chart re-queries itself (`ownState` data-mask flow) and the other
  dashboard charts receive the span filter.
- In Explore the pickers are informational — configure periods in the control
  panel there.
- Enable **cross-filtering** on the dashboard for the span filter to reach
  other charts.

### Integration with date filters

Install the [`superset-plugin-filter-period-ranges`](https://github.com/Kami-sama322/superset-plugin-filter-period-ranges)
native filter and add it to the dashboard (in the chart's scope): the chart
defers to it — the on-chart pickers are replaced by a plaque, the filter's
ranges are re-applied to the chart's own time column in its queries, and
while the filter has no ranges selected the chart shows a hint instead of
data. The chart detects **any** date/time filter reaching it through the
aggregated `extra_form_data`: the period_ranges structured channel, any
`TEMPORAL_RANGE` clause (calendar filter, built-in Time range filter,
other charts), or a `time_range` override. Priority: date filter →
on-chart pickers (ownState) → control-panel config. Without a date filter
in scope the pickers work as before.

### Behavior notes

- The span filter intersects with dashboard date filters (standard Superset
  semantics).
- Timestamps are parsed as UTC; data buckets are relative to each period
  start snapped to the grain boundary (weeks start on Monday). Impossible
  calendar dates are rejected.
- Log scale: values ≤ 0 become gaps; sqrt scale: values < 0 become gaps.
- Unequal period lengths block applying the filter (inline error); at least
  one period picker always remains.
- Colors not set in the control panel follow the dashboard theme, so the
  chart stays readable in dark dashboards.

## Tests

Jest-style `src/*.test.ts` (flat `test()`), run inside the Superset frontend
tree after `install.sh`:

```bash
cd superset-frontend && npx jest plugins/plugin-chart-period-comparison
```

Covered: period parsing/snapping/buckets/validation, query planning
(TEMPORAL_RANGE per period, grain mapping, shared filters), series
alignment/scaling, data-mask building, ECharts option tree (marker symbols
per series, axes, tooltip), buildQuery wiring.

## License

Apache-2.0
