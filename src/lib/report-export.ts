'use client';

import type { AppState } from './types';
import { computeRouteETAs, formatMinutes } from './eta-calculator';

/**
 * Generate and open a comprehensive operations summary PDF report.
 */
export function exportSummaryReport(state: AppState): void {
  const routes = Object.values(state.routes);
  const stops = Object.values(state.stops);
  const vehicles = Object.values(state.vehicles);
  const deliveryRoutes = routes.filter(r => r.serviceMode === 'mulch');
  const spreadingRoutes = routes.filter(r => r.serviceMode === 'spreading');

  // ── Aggregate bag / mulch-type metrics ──────────────────────────────────
  const bagsByType: Record<string, number> = {};
  let totalBagsDelivered = 0;
  let totalBagsSpread = 0;
  let totalStops = 0;
  let assignedStops = 0;
  const scoutSales: Record<string, number> = {};

  stops.forEach(stop => {
    if (stop.isDisabled) return;
    totalStops++;
    const isAssigned = !!(stop.routeId || stop.spreadingRouteId);
    if (isAssigned) assignedStops++;

    stop.mulchOrders.forEach(order => {
      bagsByType[order.mulchType] = (bagsByType[order.mulchType] || 0) + order.quantity;
      totalBagsDelivered += order.quantity;
      if (order.scoutName) {
        scoutSales[order.scoutName] = (scoutSales[order.scoutName] || 0) + order.quantity;
      }
    });
    if (stop.spreadingOrder) {
      totalBagsSpread += stop.spreadingOrder.quantity;
    }
  });

  // ── Route-level metrics ─────────────────────────────────────────────────
  let totalMiles = 0;
  let totalDriveMins = 0;
  let totalLaborMins = 0;
  let totalFuelCost = 0;

  const routeRows: string[] = [];
  for (const route of [...deliveryRoutes, ...spreadingRoutes]) {
    const vehicle = state.vehicles[route.vehicleId];
    const etaResult = computeRouteETAs(route, state);
    const routeLaborMins = etaResult.stops.reduce((s, e) => s + e.timeAtStop, 0);
    const routeBags = route.stopIds.reduce((sum, id) => {
      const stop = state.stops[id];
      if (!stop) return sum;
      return sum + (route.serviceMode === 'spreading'
        ? (stop.spreadingOrder?.quantity || 0)
        : stop.totalBags);
    }, 0);
    const routeMiles = route.distanceMiles || 0;
    const routeDrive = route.durationMinutes || 0;
    const vehicleFuelRate = vehicle?.fuelCostPerMile ?? 0;
    const routeFuel = routeMiles > 0 && vehicleFuelRate > 0
      ? routeMiles * vehicleFuelRate : 0;

    totalMiles += routeMiles;
    totalDriveMins += routeDrive;
    totalLaborMins += routeLaborMins;
    totalFuelCost += routeFuel;

    const totalTime = routeDrive + routeLaborMins + (etaResult.lunchBreak ? etaResult.lunchBreak.durationMins : 0);
    const serviceIcon = route.serviceMode === 'spreading' ? '🌱' : '🚛';
    const lunchStr = etaResult.lunchBreak ? `${formatMinutes(etaResult.lunchBreak.startMins)} - ${formatMinutes(etaResult.lunchBreak.startMins + etaResult.lunchBreak.durationMins)}` : '—';

    routeRows.push(`<tr>
            <td style="color:${route.color};font-weight:700">${serviceIcon} ${route.name}</td>
            <td>${vehicle?.name || '—'}</td>
            <td style="text-align:center">${route.stopIds.length}</td>
            <td style="text-align:center">${routeBags}</td>
            <td style="text-align:center">${routeMiles > 0 ? routeMiles.toFixed(1) + ' mi' : '—'}</td>
            <td style="text-align:center">${routeDrive > 0 ? Math.round(routeDrive) + ' min' : '—'}</td>
            <td style="text-align:center">${routeLaborMins > 0 ? Math.round(routeLaborMins) + ' min' : '—'}</td>
            <td style="text-align:center;font-size:11px;white-space:nowrap">${lunchStr}</td>
            <td style="text-align:center">${totalTime > 0 ? Math.round(totalTime) + ' min' : '—'}</td>
            <td style="text-align:center">${routeFuel > 0 ? '$' + routeFuel.toFixed(2) : '—'}</td>
            <td style="text-align:center">${route.mulchType || (route.serviceMode === 'spreading' ? 'Spreading' : 'Mixed')}</td>
        </tr>`);
  }

  // ── Vehicle utilization ─────────────────────────────────────────────────
  const vehicleRows: string[] = [];
  vehicles.forEach(v => {
    const assignedRoutes = routes.filter(r => r.vehicleId === v.id);
    const totalVehicleBags = assignedRoutes.reduce((sum, r) => {
      return sum + r.stopIds.reduce((s, id) => s + (state.stops[id]?.totalBags || 0), 0);
    }, 0);
    const cap = v.maxBagCapacity !== 9999 ? v.maxBagCapacity : null;
    const utilPct = cap ? Math.round((totalVehicleBags / cap) * 100) : null;
    const utilBar = utilPct !== null
      ? `<div style="background:#e5e7eb;border-radius:4px;height:8px;width:80px;display:inline-block;vertical-align:middle;margin-left:6px">
                 <div style="background:${utilPct > 90 ? '#ef4444' : utilPct > 70 ? '#f59e0b' : '#22c55e'};height:8px;border-radius:4px;width:${Math.min(utilPct, 100)}%"></div>
               </div> ${utilPct}%`
      : '<span style="color:#888">N/A</span>';
    vehicleRows.push(`<tr>
            <td>${v.name}</td>
            <td style="text-align:center">${v.type}</td>
            <td style="text-align:center">${cap ?? 'Unlimited'}</td>
            <td>${utilBar}</td>
            <td style="text-align:center">${assignedRoutes.length}</td>
            <td style="text-align:center">${v.fuelCostPerMile ? '$' + v.fuelCostPerMile.toFixed(3) + '/mi' : '—'}</td>
        </tr>`);
  });

  // ── Scout sales leaderboard ─────────────────────────────────────────────
  const sortedScouts = Object.entries(scoutSales)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);
  const scoutRows = sortedScouts.map(([name, bags], i) =>
    `<tr>
            <td style="text-align:center;font-weight:700;color:#6366f1">${i + 1}</td>
            <td>${name}</td>
            <td style="text-align:center;font-weight:700">${bags}</td>
            <td style="text-align:center">${((bags / totalBagsDelivered) * 100).toFixed(1)}%</td>
        </tr>`
  ).join('');

  // ── Mulch type breakdown ────────────────────────────────────────────────
  const mulchTypeRows = Object.entries(bagsByType)
    .sort(([, a], [, b]) => b - a)
    .map(([type, bags]) => {
      const pct = totalBagsDelivered > 0 ? ((bags / totalBagsDelivered) * 100).toFixed(1) : '0';
      const bar = `<div style="background:#e5e7eb;border-radius:4px;height:10px;width:120px;display:inline-block;vertical-align:middle">
                <div style="background:#3b82f6;height:10px;border-radius:4px;width:${pct}%"></div>
              </div>`;
      return `<tr>
                <td>${type}</td>
                <td style="text-align:center;font-weight:700">${bags}</td>
                <td style="text-align:center">${pct}%</td>
                <td>${bar}</td>
            </tr>`;
    }).join('');

  // ── Schedule info ───────────────────────────────────────────────────────
  const deliveryDateStr = state.settings.deliveryDate
    ? new Date(state.settings.deliveryDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const spreadingDateStr = state.settings.spreadingDate
    ? new Date(state.settings.spreadingDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const deliveryStartStr = formatMinutes(
    (state.settings.deliveryStartTime || '08:00').split(':').reduce((h, m) => h * 60 + Number(m), 0)
  );
  const spreadingStartStr = formatMinutes(
    (state.settings.spreadingStartTime || '09:00').split(':').reduce((h, m) => h * 60 + Number(m), 0)
  );
  const lunchStartStr = formatMinutes(
    (state.settings.lunchBreakStartTime || '12:00').split(':').reduce((h, m) => h * 60 + Number(m), 0)
  );
  const lunchDur = state.settings.lunchBreakDuration ?? 30;
  const lunchEndStr = formatMinutes(
    (state.settings.lunchBreakStartTime || '12:00').split(':').reduce((h, m) => h * 60 + Number(m), 0) + lunchDur
  );

  // ── Total estimated time (drive + labor + breaks) ───────────────────────
  const totalBreakMins = lunchDur; // one break per route crew — approximate
  const grandTotalMins = totalDriveMins + totalLaborMins;

  // ── Build HTML ──────────────────────────────────────────────────────────
  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Operations Summary Report – Mulch Delivery</title>
<style>
  :root { --blue: #3b82f6; --green: #22c55e; --amber: #f59e0b; --purple: #8b5cf6; --red: #ef4444; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; font-size: 13px; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: var(--blue); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
  @media print { .print-btn { display:none; } body { background:white; padding:12px; } }
  h1 { font-size: 26px; font-weight: 800; color: #0f172a; }
  .subtitle { color: #64748b; font-size: 13px; margin-top: 2px; margin-bottom: 20px; }
  .section { background: white; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 20px; overflow: hidden; }
  .section-header { background: #f1f5f9; padding: 10px 16px; font-size: 13px; font-weight: 700; color: #475569; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 6px; }
  .section-body { padding: 16px; }
  /* KPI cards */
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; text-align: center; }
  .kpi-value { font-size: 28px; font-weight: 800; line-height: 1; }
  .kpi-label { font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: .5px; }
  .kpi-blue .kpi-value { color: var(--blue); }
  .kpi-green .kpi-value { color: var(--green); }
  .kpi-amber .kpi-value { color: var(--amber); }
  .kpi-purple .kpi-value { color: var(--purple); }
  .kpi-red .kpi-value { color: var(--red); }
  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f8fafc; padding: 7px 10px; font-weight: 700; text-align: left; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  tfoot td { font-weight: 700; background: #f1f5f9; border-top: 2px solid #e2e8f0; }
  /* Schedule */
  .sched-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .sched-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
  .sched-title { font-weight: 700; font-size: 12px; margin-bottom: 6px; }
  .sched-row { display: flex; justify-content: space-between; font-size: 12px; color: #475569; padding: 2px 0; }
  .sched-val { font-weight: 600; color: #1e293b; }
  /* Two-col layout */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } .sched-grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>

<h1>🌲 Operations Summary Report</h1>
<div class="subtitle">Generated: ${generatedAt} &nbsp;·&nbsp; Depot: ${state.settings.depotAddress || 'Not configured'}</div>

<!-- KPI Overview -->
<div class="section">
  <div class="section-header">📊 Key Performance Indicators</div>
  <div class="section-body">
    <div class="kpi-grid">
      <div class="kpi kpi-blue"><div class="kpi-value">${totalBagsDelivered}</div><div class="kpi-label">Bags to Deliver</div></div>
      <div class="kpi kpi-green"><div class="kpi-value">${totalBagsSpread}</div><div class="kpi-label">Bags to Spread</div></div>
      <div class="kpi kpi-purple"><div class="kpi-value">${routes.length}</div><div class="kpi-label">Total Routes</div></div>
      <div class="kpi kpi-amber"><div class="kpi-value">${vehicles.length}</div><div class="kpi-label">Vehicles</div></div>
      <div class="kpi kpi-blue"><div class="kpi-value">${totalMiles > 0 ? totalMiles.toFixed(1) : '—'}</div><div class="kpi-label">Total Miles</div></div>
      <div class="kpi kpi-amber"><div class="kpi-value">${grandTotalMins > 0 ? Math.round(grandTotalMins) : '—'}</div><div class="kpi-label">Est. Work Mins</div></div>
      <div class="kpi kpi-green"><div class="kpi-value">${totalFuelCost > 0 ? '$' + totalFuelCost.toFixed(2) : '—'}</div><div class="kpi-label">Est. Fuel Cost</div></div>
      <div class="kpi kpi-red"><div class="kpi-value">${totalStops - assignedStops}</div><div class="kpi-label">Unassigned Stops</div></div>
      <div class="kpi"><div class="kpi-value">${assignedStops}</div><div class="kpi-label">Assigned Stops</div></div>
      <div class="kpi kpi-purple"><div class="kpi-value">${Object.keys(scoutSales).length}</div><div class="kpi-label">Scouts</div></div>
    </div>
  </div>
</div>

<!-- Schedule & Timing -->
<div class="section">
  <div class="section-header">⏱ Schedule & Timing</div>
  <div class="section-body">
    <div class="sched-grid">
      <div class="sched-card">
        <div class="sched-title">🚛 Delivery Crew</div>
        <div class="sched-row"><span>Date</span><span class="sched-val">${deliveryDateStr}</span></div>
        <div class="sched-row"><span>Start Time</span><span class="sched-val">${deliveryStartStr}</span></div>
        <div class="sched-row"><span>Routes</span><span class="sched-val">${deliveryRoutes.length}</span></div>
        <div class="sched-row"><span>Stops</span><span class="sched-val">${deliveryRoutes.reduce((s, r) => s + r.stopIds.length, 0)}</span></div>
        <div class="sched-row"><span>Min/bag (unload)</span><span class="sched-val">${state.settings.timeSpentPerDeliveryBag ?? 2} min</span></div>
      </div>
      <div class="sched-card">
        <div class="sched-title">🌱 Spreading Crew</div>
        <div class="sched-row"><span>Date</span><span class="sched-val">${spreadingDateStr}</span></div>
        <div class="sched-row"><span>Start Time</span><span class="sched-val">${spreadingStartStr}</span></div>
        <div class="sched-row"><span>Routes</span><span class="sched-val">${spreadingRoutes.length}</span></div>
        <div class="sched-row"><span>Stops</span><span class="sched-val">${spreadingRoutes.reduce((s, r) => s + r.stopIds.length, 0)}</span></div>
        <div class="sched-row"><span>Min/bag (spread)</span><span class="sched-val">${state.settings.laborTimePerSpreadBag ?? 3} min</span></div>
      </div>
      <div class="sched-card">
        <div class="sched-title">🍽️ Lunch Break</div>
        <div class="sched-row"><span>Start</span><span class="sched-val">${lunchStartStr}</span></div>
        <div class="sched-row"><span>End</span><span class="sched-val">${lunchEndStr}</span></div>
        <div class="sched-row"><span>Duration</span><span class="sched-val">${lunchDur} min</span></div>
      </div>
      <div class="sched-card">
        <div class="sched-title">📈 Time Summary</div>
        <div class="sched-row"><span>Total Drive Time</span><span class="sched-val">${totalDriveMins > 0 ? Math.round(totalDriveMins) + ' min' : '—'}</span></div>
        <div class="sched-row"><span>Total Labor Time</span><span class="sched-val">${Math.round(totalLaborMins)} min</span></div>
        <div class="sched-row"><span>Lunch (per crew)</span><span class="sched-val">${lunchDur} min</span></div>
        <div class="sched-row"><span>Grand Total (work)</span><span class="sched-val" style="color:var(--blue)">${grandTotalMins > 0 ? Math.round(grandTotalMins) + ' min' : '—'}</span></div>
      </div>
    </div>
  </div>
</div>

<!-- Mulch Product Breakdown & Scout Leaderboard -->
<div class="two-col">
  <div class="section">
    <div class="section-header">🪵 Mulch Product Breakdown</div>
    <div class="section-body" style="padding:0">
      <table>
        <thead><tr><th>Mulch Type</th><th style="text-align:center">Bags</th><th style="text-align:center">%</th><th>Share</th></tr></thead>
        <tbody>${mulchTypeRows}</tbody>
        <tfoot><tr><td><strong>Total</strong></td><td style="text-align:center"><strong>${totalBagsDelivered}</strong></td><td></td><td></td></tr></tfoot>
      </table>
      ${totalBagsSpread > 0 ? `<div style="padding:10px 12px;background:#f0fdf4;border-top:1px solid #e2e8f0;font-size:12px;color:#166534"><strong>🌱 Spreading:</strong> ${totalBagsSpread} bags total</div>` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-header">🏆 Scout Sales Leaderboard</div>
    <div class="section-body" style="padding:0">
      ${sortedScouts.length > 0 ? `<table>
        <thead><tr><th style="text-align:center">#</th><th>Scout</th><th style="text-align:center">Bags</th><th style="text-align:center">Share</th></tr></thead>
        <tbody>${scoutRows}</tbody>
      </table>` : '<div style="padding:16px;color:#94a3b8;text-align:center">No scout data</div>'}
    </div>
  </div>
</div>

<!-- Route Details -->
<div class="section">
  <div class="section-header">🗺️ Route Details</div>
  <div class="section-body" style="padding:0;overflow-x:auto">
    <table>
      <thead><tr>
        <th>Route</th>
        <th>Vehicle</th>
        <th style="text-align:center">Stops</th>
        <th style="text-align:center">Bags</th>
        <th style="text-align:center">Miles</th>
        <th style="text-align:center">Drive</th>
        <th style="text-align:center">Labor</th>
        <th style="text-align:center">Lunch Break</th>
        <th style="text-align:center">Total Time</th>
        <th style="text-align:center">Fuel</th>
        <th style="text-align:center">Type</th>
      </tr></thead>
      <tbody>${routeRows.join('')}</tbody>
      <tfoot><tr>
        <td colspan="2"><strong>Totals</strong></td>
        <td style="text-align:center"><strong>${routes.reduce((s, r) => s + r.stopIds.length, 0)}</strong></td>
        <td style="text-align:center"><strong>${totalBagsDelivered + totalBagsSpread}</strong></td>
        <td style="text-align:center"><strong>${totalMiles > 0 ? totalMiles.toFixed(1) + ' mi' : '—'}</strong></td>
        <td style="text-align:center"><strong>${totalDriveMins > 0 ? Math.round(totalDriveMins) + ' min' : '—'}</strong></td>
        <td style="text-align:center"><strong>${Math.round(totalLaborMins)} min</strong></td>
        <td style="text-align:center"><strong>—</strong></td>
        <td style="text-align:center"><strong>${grandTotalMins > 0 ? Math.round(grandTotalMins) + ' min' : '—'}</strong></td>
        <td style="text-align:center"><strong>${totalFuelCost > 0 ? '$' + totalFuelCost.toFixed(2) : '—'}</strong></td>
        <td></td>
      </tr></tfoot>
    </table>
  </div>
</div>

<!-- Vehicle Utilization -->
<div class="section">
  <div class="section-header">🚛 Vehicle Utilization</div>
  <div class="section-body" style="padding:0">
    <table>
      <thead><tr>
        <th>Vehicle</th>
        <th style="text-align:center">Type</th>
        <th style="text-align:center">Capacity</th>
        <th>Utilization</th>
        <th style="text-align:center">Routes</th>
        <th style="text-align:center">Fuel Rate</th>
      </tr></thead>
      <tbody>${vehicleRows.join('')}</tbody>
    </table>
  </div>
</div>

<div style="margin-top:20px;text-align:center;color:#94a3b8;font-size:11px">
  Mulch Route Optimizer &nbsp;·&nbsp; Report generated ${generatedAt}
</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
