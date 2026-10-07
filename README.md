# Period Comparison Chart Plugin — Apache Superset chart
---

### [🇷🇺 Русский](README.ru.md) | 🇬🇧 English

---

> **A custom Apache Superset plugin** that compares a single metric over
> **up to 5 arbitrary date ranges** of equal length on one chart: relative
> X axis, an on-chart date filter that cross-filters the whole dashboard,
> rich line customization and vertical scale functions.

---

## Features

- Dashboard chart (not a Native Filter)
- Own date filter on the chart: 1–5 calendar range pickers rendered on the chart surface; default values come from the control panel. Changing a range re-queries the chart itself and emits a cross-filter
- Cross-filtering: the date filter emits a single `TEMPORAL_RANGE` clause covering the span of all periods (`min(start) : max(end)`), so every other chart on the dashboard is filtered by the compared time window
- Arbitrary, equal-length periods — e.g. Mon–Fri of this week vs Tue–Sat two weeks ago. Periods of different lengths are rejected by validation
- Compare by hours / days / weeks / months / quarters / years — the comparison grain buckets the data inside every period
- Relative X axis: lines are aligned by relative position inside the period ("Day 1…N"), the tooltip shows the real date of every series. The hourly grain shows the real time of the base period's buckets
- Corner cases: week/month/quarter bucket counts are computed per period start (a year compared by weeks yields 52–53 buckets, shorter series get gaps, empty buckets are rendered as gaps, not zeros)
- Y-axis scale: linear, square root, logarithmic, quadratic (power 2) — smooths out very large vs very small values. Axis ticks and labels show the original numbers; the logarithmic scale skips non-positive values
- Line customization: polyline / smooth / step (start|middle|end), area fill with opacity, values on nodes, min/max extremes
- Per-line markers and colors: every line gets a marker switch (off / auto shape / explicit circle, square, triangle, diamond or star — auto keeps a distinct shape per line), a legend alias and a color; cleared inputs fall back to the automatic values. Marker size and the D3 number format live there too
- Single-query architecture: the scan window is an OR-group of the periods' own bucket windows (`extras.where`) — exactly the rows the chart draws, never the empty gap between distant periods
- Integration with date filters: the native [period-ranges filter](https://github.com/Kami-sama322/superset-plugin-filter-period-ranges) takes the chart over; the chart also reacts to any other date filter through `extra_form_data`
- Colors not set in the control panel follow the dashboard theme, so the chart stays readable in dark dashboards

---

![Example](./images/chart_example.gif)


## Requirements

| Component | Version |
|-----------|---------|
| Apache Superset | 6.1.0 |
| Python | 3.10+ |
| Node.js | 20+ (image build: 22) |
| npm | 10+ |
| React (peer) | ^17.0.2 |
| npm package | `@superset-ui/plugin-chart-period-comparison` |
| Plugin key | `chart_period_comparison` |
| Dependencies | `dayjs`, `echarts` (both already present in the Superset frontend) |

---

## Installation

### Step 1. Clone the Superset repository (target version)

[![Version](./images/tag.png)](https://github.com/apache/superset/releases/tag/6.1.0)

```bash
git clone https://github.com/apache/superset.git -b 6.1.0;
```

### Step 2. Clone the plugin repository

```bash
git clone https://github.com/Kami-sama322/superset-plugin-chart-period-comparison.git;
```

### Step 3. Run the auto-installation script

```bash
chmod +x superset-plugin-chart-period-comparison/install.sh;
./superset-plugin-chart-period-comparison/install.sh ./superset;
```

> `./superset` — root of the Superset repo from Step 1. The script installs the plugin as a **standalone npm package** into `superset-frontend/plugins/plugin-chart-period-comparison/` and registers it at Superset's documented extension points. The script is idempotent (grep anchors).

#### What the script does:

| Action | File |
|--------|------|
| 0. Installs the plugin package | `superset-frontend/plugins/plugin-chart-period-comparison/` |
| 1. Registers the plugin | `superset-frontend/src/setup/setupPluginsExtra.ts` (`key: chart_period_comparison`) |
| 2. Adds the `file:` workspace dependency | `superset-frontend/package.json` (anchor: `plugin-chart-word-cloud`) |

> The `@superset-ui/plugin-chart-*` path alias already covers this package — no extra `tsconfig.json` entry. `FILTER_SUPPORTED_TYPES` is **not** changed (chart, not a Native Filter).

---

### Step 4b. Manual plugin registration (if install.sh fails)

#### 1. Copy the package into the plugins folder

```bash
mkdir -p superset-frontend/plugins/plugin-chart-period-comparison/src
cp -r superset-plugin-chart-period-comparison/src/. superset-frontend/plugins/plugin-chart-period-comparison/src/
cp superset-plugin-chart-period-comparison/package.json superset-frontend/plugins/plugin-chart-period-comparison/package.json
cp superset-plugin-chart-period-comparison/tsconfig.json superset-frontend/plugins/plugin-chart-period-comparison/tsconfig.json
```

#### 2. Register in `superset-frontend/src/setup/setupPluginsExtra.ts`

```typescript
import PeriodComparisonChartPlugin from '@superset-ui/plugin-chart-period-comparison';

export default function setupPluginsExtra() {
  new PeriodComparisonChartPlugin()
    .configure({ key: 'chart_period_comparison' })
    .register();
}
```

Then run `npm install` and `npm run dev-server`.

---

## Deploy Superset in DEV mode

### Step 5. Python environment

```bash
cd superset
python -m venv .venv
source .venv/bin/activate
pip install -r requirements/development.txt
```

### Step 6. Configuration

Copy or symlink `superset_config.py` from this repo into the Superset root, or set:

```bash
export SUPERSET_CONFIG_PATH=/path/to/superset-plugin-chart-period-comparison/superset_config.py
```

The plugin loads no external resources (map tiles, runtime template
compilation) — no CSP exceptions are required. The `superset_config.py`
shipped in the repo is only a convenient dev setup (DEBUG,
`DASHBOARD_CROSS_FILTERING` / `DASHBOARD_NATIVE_FILTERS` flags).

### Step 7–10. Database and admin

```bash
superset db upgrade
superset fab create-admin \
  --username admin --firstname Admin --lastname User \
  --email admin@example.com --password admin
superset init
```

### Step 11–13. Backend and frontend

```bash
# terminal 1 — backend
superset run -h 0.0.0.0 -p 8088 --with-threads --reload --debugger

# terminal 2 — frontend (after install.sh + npm install in superset-frontend)
cd superset-frontend
npm install
npm run dev-server
```

---

## Quick start with Docker

This repo ships a self-contained stack: `Dockerfile` builds Superset **6.1.0**
with the plugin baked in; `docker-compose.yml` runs it with `superset_config.py`
(dev config) mounted read-only.

**Requirements:** Docker, Docker Compose v2, ~8 GB RAM for the frontend build.

```bash
git clone https://github.com/Kami-sama322/superset-plugin-chart-period-comparison.git
cd superset-plugin-chart-period-comparison

docker compose build    # first run: clones Superset 6.1.0 + npm run build (15–40 min)
docker compose up -d    # init DB, admin admin/admin, load-examples on first start
```

Open **http://localhost:8088** → login **admin** / **admin**.

On first start the container runs `superset db upgrade`, creates the admin user,
and loads example datasets (1–3 minutes). Later starts skip init if the volume
exists.

**Reset environment** (fresh DB and examples):

```bash
docker compose down -v
docker compose up -d
```

**Verify the plugin:** Charts → + Chart → **Period Comparison**.

---

## How to use the chart

1. **Charts → + Chart → Period Comparison**
2. Dataset with columns:
   - a **time column** (e.g. `dttm`) — the periods and the comparison grain are applied to it
   - **Metric** (a single one) — the numeric value compared across all periods
   - *(optional)* adhoc filters and a row limit
3. **Query**: metric, time column, **Compare by** grain (hours / days / weeks / months / quarters / years)
4. **Periods**: 1–5 ranges of equal length (date-only picking; the last day is inclusive) — this defines the defaults for the on-chart pickers
5. **Chart Options**: line type (a **Step position** select appears for step lines)
6. Collapsed sections: **Line display** (line width, node values, extremes, value font size, area), **Scale, legend and zoom** (Y-axis scale, legend, zoom, grid/axis colors), **Colors and labels** (per-line marker / alias / color, marker size, number format)
7. **On the dashboard** enable **cross-filtering**: the pickers on the chart toolbar re-query the chart itself and filter the other charts by the span window. In Explore the pickers are informational — configure periods in the control panel there

### Integration with date filters

Install the native
[`superset-plugin-filter-period-ranges`](https://github.com/Kami-sama322/superset-plugin-filter-period-ranges)
filter and add it to the dashboard (in the chart's scope) — the chart defers
to the filter: the pickers are replaced by a "Periods from filter" plaque and
the filter's ranges are applied to the chart's own time column. While the
filter has no ranges selected the chart shows a hint; "Clear all" never
brings the pickers back while the filter exists.

The chart also reacts to **any other date filter** (the calendar filter, the
built-in Time range filter, `TEMPORAL_RANGE` clauses from other charts): the
pickers hide, the chart keeps its configured periods and they are narrowed by
the filter; under the filter the legend names the range each line actually
shows (the period ∩ the applied window).

Period source priority: period_ranges structured ranges → any applied date
filter → on-chart pickers (ownState) → control-panel config.

### Example dataset shape

| dttm | deals |
|------|-------|
| 2026-09-01 10:00:00 | 120 |
| 2026-09-02 11:30:00 | 98 |
| 2026-10-06 09:15:00 | 45 |

The periods `2026-09-01 → 2026-09-05` and `2026-10-06 → 2026-10-10` with the
"Days" grain produce two lines of 5 buckets each (Day 1…5) aligned on the
relative X axis; the query scans only the days inside the periods, never the
gap between them.

---

## Package layout

```
superset-plugin-chart-period-comparison/
├── README.md
├── README.ru.md
├── src/
│   ├── index.ts
│   ├── PeriodComparison.tsx       # on-chart pickers toolbar + ECharts
│   ├── PeriodsToolbar.tsx         # 1–5 RangePickers, validation, setDataMask
│   ├── buildQuery.ts              # single span query
│   ├── queryPlan.ts               # query planning
│   ├── transformProps.ts          # rows → series → ECharts options
│   ├── periods.ts                 # period math + date-filter contract
│   ├── scale.ts                   # linear/sqrt/log/power2
│   ├── seriesData.ts              # rows → aligned series
│   ├── chartOptions.ts            # ECharts options generator
│   ├── crossFilter.ts             # dataMask: ownState + span TEMPORAL_RANGE
│   ├── controlPanel.ts
│   ├── controls/
│   │   ├── PeriodsControl.tsx     # periods editor in Explore
│   │   ├── SeriesStyleControl.tsx # marker/alias/color per line
│   │   └── ChartColorsControl.tsx # grid/axis colors
│   ├── images/thumbnail.png
│   └── *.test.ts
├── package.json
├── install.sh
├── Dockerfile                  # Superset 6.1.0 + plugin production build
├── docker-compose.yml          # Local demo stack
└── superset_config.py          # Dev/Docker config
```

---

## License

Apache License 2.0 (same as Superset)
