// Adaptation of the Apache-2.0 ThingsBoard thermostats demonstration.
export function buildDashboard(upstream) {
  const board = structuredClone(upstream);
  delete board.id;
  delete board.tenantId;
  delete board.customerId;
  board.title = 'Industrial Process Monitoring and Analytics';
  const c = board.configuration;
  const fleet = '68a058e1-fdda-8482-715b-3ae4a488568e';
  c.entityAliases = { [fleet]: { id: fleet, alias: 'Industrial equipment', filter: {
    type: 'deviceType', resolveMultiple: true, deviceNameFilter: '', deviceTypes: ['industrial-telemetry']
  } } };
  const selected = Object.entries(c.widgets).filter(([, w]) => ['system.cards.entities_table', 'system.alarm_widgets.alarms_table', 'system.time_series_chart'].includes(w.typeFullFqn));
  c.widgets = Object.fromEntries(selected);
  const grid = structuredClone(c.states.default.layouts.main.gridSettings);
  grid.backgroundColor = '#edf2f7';
  grid.autoFillHeight = false;
  const positions = {};
  let chartIndex = 0;
  for (const [id, w] of selected) {
    const config = w.config;
    config.actions = {};
    config.borderRadius = '8px';
    config.titleColor = '#16324f';
    for (const ds of config.datasources ?? []) ds.entityAliasId = fleet;
    if (config.alarmSource) config.alarmSource.entityAliasId = fleet;
    if (w.typeFullFqn === 'system.cards.entities_table') {
      config.title = 'Equipment overview | Synthetic measurements';
      config.settings.entitiesTitle = 'Equipment | Synthetic Azure data';
      config.settings.displayPagination = false;
      config.settings.entityNameColumnTitle = 'Equipment';
      config.datasources[0].dataKeys = [
        {name: 'temperature_c', type: 'timeseries', label: 'Temperature', units: '°C', decimals: 1, settings: {}},
        {name: 'vibration_mm_s', type: 'timeseries', label: 'Vibration', units: 'mm/s', decimals: 2, settings: {}},
        {name: 'state', type: 'timeseries', label: 'State', settings: {}},
        {name: 'measured_at', type: 'attribute', label: 'Measured at (UTC)', settings: {}}
      ];
      positions[id] = {sizeX: 14, sizeY: 7, row: 0, col: 0};
    } else if (w.typeFullFqn === 'system.alarm_widgets.alarms_table') {
      config.title = 'Equipment alarms';
      config.settings.alarmsTitle = 'Azure alarm history | Local copy';
      config.alarmSource.dataKeys = config.alarmSource.dataKeys.filter(k => k.name !== 'assignee');
      const raisedTime = config.alarmSource.dataKeys.find(k => k.name === 'createdTime');
      raisedTime.name = 'startTime';
      raisedTime.label = 'Raised at';
      const alarmType = config.alarmSource.dataKeys.find(k => k.name === 'type');
      alarmType.settings = {useCellContentFunction: true, cellContentFunction: "return String(value).split(' / ')[0];"};
      positions[id] = {sizeX: 10, sizeY: 7, row: 0, col: 14};
    } else {
      const vibration = chartIndex === 1;
      const key = config.datasources[0].dataKeys[0];
      key.name = vibration ? 'vibration_mm_s' : 'temperature_c';
      key.label = '${entityName}';
      key.units = vibration ? 'mm/s' : '°C';
      key.decimals = vibration ? 2 : 1;
      config.title = vibration ? 'Vibration history (mm/s)' : 'Temperature history (°C)';
      config.datasources[0].latestDataKeys = [];
      config.settings.thresholds = [];
      config.settings.yAxes.default.units = key.units;
      config.useDashboardTimewindow = true;
      positions[id] = {sizeX: 12, sizeY: 8, row: 7, col: chartIndex * 12};
      chartIndex++;
    }
  }
  c.states = {default: {name: 'Industrial monitoring', root: true, layouts: {main: {widgets: positions, gridSettings: grid}}}};
  c.timewindow = {selectedTab: 0, realtime: {realtimeType: 0, timewindowMs: 3600000, interval: 1000}, aggregation: {type: 'NONE', limit: 1000}};
  return board;
}
