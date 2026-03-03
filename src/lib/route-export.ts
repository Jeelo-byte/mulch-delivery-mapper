'use client';

import type { AppState } from './types';
import { computeRouteETAs, computeRouteEffectiveStartMins, computeRouteEndMins, formatMinutes } from './eta-calculator';
import { getMulchColor } from './color-utils';

/**
 * Export route(s) to CSV with detailed stop information
 */
export function exportRoutesToCSV(
    state: AppState,
    routeIds?: string[] // if undefined, export all
): string {
    const routes = routeIds
        ? routeIds.map(id => state.routes[id]).filter(Boolean)
        : Object.values(state.routes);

    const headers = [
        'Route Name',
        'Vehicle',
        'Stop #',
        'ETA',
        'Time at Stop (mins)',
        'Recipient Name',
        'Street Address',
        'City',
        'State',
        'Zip Code',
        'Mulch Type',
        'Mulch Quantity',
        'Total Bags',
        'Scout Name',
        'Placement Instructions',
        'Fulfillment Notes',
        'Order ID',
        'Order Date',
        'Phone',
        'Email',
        'Route Miles',
        'Route Drive Time (min)',
        'Estimated Fuel Cost',
    ];

    const rows: string[][] = [headers];

    for (const route of routes) {
        const vehicle = state.vehicles[route.vehicleId];
        const fuelRate = vehicle?.fuelCostPerMile ?? 0;
        const fuelCost = route.distanceMiles && fuelRate > 0 ? (route.distanceMiles * fuelRate).toFixed(2) : '';

        const etaMap = new Map(computeRouteETAs(route, state).stops.map(e => [e.stopId, e]));

        route.stopIds.forEach((stopId, idx) => {
            const stop = state.stops[stopId];
            if (!stop) return;

            const etaInfo = etaMap.get(stopId);
            const etaStr = etaInfo?.etaStr ?? '—';
            const timeAtStop = etaInfo ? Math.round(etaInfo.timeAtStop) : 0;

            // One row per mulch order at this stop
            if (stop.mulchOrders.length > 0) {
                for (const order of stop.mulchOrders) {
                    rows.push([
                        route.name,
                        vehicle?.name || '',
                        String(idx + 1),
                        etaStr,
                        String(timeAtStop),
                        stop.recipientName,
                        stop.fullAddress.split(',')[0]?.trim() || stop.fullAddress,
                        stop.city,
                        stop.region,
                        stop.postalCode,
                        order.mulchType,
                        String(order.quantity),
                        String(stop.totalBags),
                        order.scoutName,
                        order.placementInstructions.join('; '),
                        stop.fulfillmentNotes,
                        stop.orderId,
                        stop.orderDate,
                        stop.recipientPhone,
                        stop.recipientEmail,
                        route.distanceMiles?.toFixed(1) || '',
                        route.durationMinutes ? String(Math.round(route.durationMinutes)) : '',
                        fuelCost,
                    ]);
                }
            } else {
                rows.push([
                    route.name,
                    vehicle?.name || '',
                    String(idx + 1),
                    etaStr,
                    String(timeAtStop),
                    stop.recipientName,
                    stop.fullAddress.split(',')[0]?.trim() || stop.fullAddress,
                    stop.city,
                    stop.region,
                    stop.postalCode,
                    '',
                    '',
                    String(stop.totalBags),
                    '',
                    '',
                    stop.fulfillmentNotes,
                    stop.orderId,
                    stop.orderDate,
                    stop.recipientPhone,
                    stop.recipientEmail,
                    route.distanceMiles?.toFixed(1) || '',
                    route.durationMinutes ? String(Math.round(route.durationMinutes)) : '',
                    fuelCost,
                ]);
            }
        });
    }

    return rows.map(row =>
        row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
}

/**
 * Trigger a CSV download
 */
export function downloadCSV(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Export route(s) to printable HTML (opens in new window for PDF print)
 */
export function exportRoutesToPDF(
    state: AppState,
    routeIds?: string[]
) {
    const unorderedRoutes = routeIds
        ? routeIds.map(id => state.routes[id]).filter(Boolean)
        : Object.values(state.routes);

    // Group by vehicle, then sort by effective start time
    const routes = [...unorderedRoutes].sort((a, b) => {
        const vA = state.vehicles[a.vehicleId]?.name || '';
        const vB = state.vehicles[b.vehicleId]?.name || '';
        if (vA !== vB) return vA.localeCompare(vB);
        const startA = computeRouteEffectiveStartMins(a, state);
        const startB = computeRouteEffectiveStartMins(b, state);
        return startA - startB;
    });

    const fuelRate_unused = null; // fuel cost is now per-vehicle
    const depotAddr = state.settings.depotAddress || 'Not set';
    const deliveryStart = state.settings.deliveryStartTime || '08:00';
    const spreadingStart = state.settings.spreadingStartTime || '09:00';
    const deliveryDate = state.settings.deliveryDate || '';
    const spreadingDate = state.settings.spreadingDate || '';
    const lunchBreakStart = state.settings.lunchBreakStartTime || '12:00';
    const lunchBreakDur = state.settings.lunchBreakDuration ?? 30;
    const lunchBreakStartMins = lunchBreakStart.split(':').reduce((h, m) => h * 60 + Number(m), 0);
    const lunchBreakEndStr = formatMinutes(lunchBreakStartMins + lunchBreakDur);

    let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Route Delivery Sheet</title>
<style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; color: #1a1a1a; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .header-meta { font-size: 12px; color: #666; margin-bottom: 20px; }
    .route-section { page-break-inside: avoid; margin-bottom: 30px; }
    .route-title { font-size: 18px; font-weight: 700; margin-bottom: 4px; padding: 8px 12px; border-left: 5px solid; }
    .route-info { font-size: 12px; color: #555; margin-bottom: 10px; padding-left: 17px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px; }
    th { background: #f3f4f6; padding: 6px 8px; text-align: left; font-weight: 700; border-bottom: 2px solid #d1d5db; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    tr:nth-child(even) { background: #f9fafb; }
    .stop-num { font-weight: 700; width: 30px; text-align: center; }
    .mulch-tag { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
    .totals { font-weight: 700; background: #e5e7eb; }
    .notes { font-size: 10px; color: #888; font-style: italic; }
    .time-col { white-space: nowrap; font-size: 11px; color: #4b5563; }
    @media print { .no-print { display: none; } body { margin: 10px; } }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
<h1>🌲 Mulch Delivery Route Sheet</h1>
<div class="header-meta">
    Generated: ${new Date().toLocaleString()}<br>
    Depot: ${depotAddr}<br>
    🚛 Delivery: ${deliveryDate} at ${formatMinutes(deliveryStart.split(':').reduce((h, m) => h * 60 + Number(m), 0))}<br>
    🌱 Spreading: ${spreadingDate} at ${formatMinutes(spreadingStart.split(':').reduce((h, m) => h * 60 + Number(m), 0))}<br>
    🍽️ Lunch Break: ${formatMinutes(lunchBreakStartMins)} – ${lunchBreakEndStr} (${lunchBreakDur} min)<br>
    Total Routes: ${routes.length}
</div>`;

    for (const route of routes) {
        const vehicle = state.vehicles[route.vehicleId];
        const totalBags = route.stopIds.reduce(
            (sum, id) => sum + (state.stops[id]?.totalBags || 0), 0
        );
        const vehicleFuelRate = vehicle?.fuelCostPerMile ?? 0;
        const fuelCost = route.distanceMiles && vehicleFuelRate > 0
            ? (route.distanceMiles * vehicleFuelRate).toFixed(2)
            : '—';



        // Compute ETAs for this route
        const etaResult = computeRouteETAs(route, state);
        const etaInfos = etaResult.stops;
        const routeLunch = etaResult.lunchBreak;
        const etaMap = new Map(etaInfos.map(e => [e.stopId, e]));
        const totalLaborMins = etaInfos.reduce((s, e) => s + e.timeAtStop, 0);
        const totalTimeMins = (route.durationMinutes || 0) + totalLaborMins + (routeLunch ? routeLunch.durationMins : 0);

        // Effective start time — accounts for prior trips on the same vehicle
        const effectiveStartMins = computeRouteEffectiveStartMins(route, state);
        const startTimeStr = formatMinutes(effectiveStartMins);

        // Return-to-depot time
        const returnMins = computeRouteEndMins(route, state, effectiveStartMins);
        const returnTimeStr = formatMinutes(returnMins);

        html += `
<div class="route-section">
    <div class="route-title" style="border-color:${route.color}">${route.name}</div>
    <div class="route-info">
        Vehicle: ${vehicle?.name || '—'} | 
        Stops: ${route.stopIds.length} | 
        Total Bags: ${totalBags} | 
        Miles: ${route.distanceMiles?.toFixed(1) || '—'} | 
        Drive Time: ${route.durationMinutes ? Math.round(route.durationMinutes) + ' min' : '—'} | 
        Labor Time: ${Math.round(totalLaborMins)} min | 
        Total Time: ${totalTimeMins > 0 ? Math.round(totalTimeMins) + ' min' : '—'} | 
        Fuel: $${fuelCost}
        ${route.mulchType ? ` | Type: ${route.mulchType}` : ''}
    </div>
    <table>
        <thead><tr>
            <th>#</th>
            <th>ETA</th>
            <th>Time at Stop</th>
            <th>Recipient</th>
            <th>Address</th>
            <th>Zip</th>
            <th>Mulch</th>
            <th>Qty</th>
            <th>Map Link</th>
            <th>Notes / Instructions</th>
        </tr></thead>
        <tbody>`;

        let lunchRowInserted = false;

        // Lunch break reference for this route
        const checkInsertLunch = (currentMinsAfterEvent: number) => {
            if (!lunchRowInserted && routeLunch && currentMinsAfterEvent >= routeLunch.startMins) {
                lunchRowInserted = true;
                const startStr = formatMinutes(routeLunch.startMins);
                const endStr = formatMinutes(routeLunch.startMins + routeLunch.durationMins);
                return `<tr style="background:#fef9c3; border-left: 4px solid #f59e0b;">
                    <td class="stop-num" style="font-size:16px;">🍽️</td>
                    <td><strong>${startStr}</strong></td>
                    <td class="time-col">${routeLunch.durationMins} min</td>
                    <td colspan="7" style="font-weight:600; color:#92400e;">
                        LUNCH BREAK &nbsp;•&nbsp; ${startStr} – ${endStr}
                        &nbsp;(${routeLunch.durationMins} min)
                    </td>
                </tr>`;
            }
            return '';
        };

        // Depot start row
        if (depotAddr !== 'Not set') {
            html += `<tr style="background:#dbeafe"><td class="stop-num">🏠</td><td><strong>${startTimeStr}</strong></td><td>—</td><td colspan="7"><strong>START:</strong> ${depotAddr}</td></tr>`;
        }

        route.stopIds.forEach((stopId, idx) => {
            const stop = state.stops[stopId];
            if (!stop) return;

            const eta = etaMap.get(stopId);
            const etaStr = eta?.etaStr ?? '—';
            const timeAtStop = eta ? Math.round(eta.timeAtStop) : 0;

            // Insert lunch break row before the first stop whose arrival crosses the lunch window
            html += checkInsertLunch(eta?.cumulativeMins ?? 0);

            const streetAddr = stop.fullAddress.split(',')[0]?.trim() || stop.fullAddress;
            const mulchInfo = stop.mulchOrders.map(o =>
                `<span class="mulch-tag" style="background-color: ${getMulchColor(o.mulchType)}; color: white;">${o.mulchType}</span>`
            ).join(' ');
            const qtyInfo = stop.mulchOrders.map(o => o.quantity).join(', ') || (stop.spreadingOrder ? stop.spreadingOrder.quantity : '');
            const mapLink = `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.fullAddress)}" target="_blank" style="color: #3b82f6; text-decoration: underline;">Open Map</a>`;
            const notesArr = [
                ...stop.mulchOrders.flatMap(o => o.placementInstructions),
                stop.fulfillmentNotes,
            ].filter(Boolean);

            html += `<tr>
                <td class="stop-num">${idx + 1}</td>
                <td><strong>${etaStr}</strong></td>
                <td class="time-col">${timeAtStop > 0 ? `~${timeAtStop} min` : '—'}</td>
                <td>${stop.recipientName}</td>
                <td>${streetAddr}</td>
                <td>${stop.postalCode}</td>
                <td>${mulchInfo || '—'}</td>
                <td>${qtyInfo}</td>
                <td>${mapLink}</td>
                <td class="notes">${notesArr.join('; ') || '—'}</td>
            </tr>`;

            // Insert lunch break AFTER this stop if labor passed lunch
            html += checkInsertLunch((eta?.cumulativeMins ?? 0) + timeAtStop);
        });

        // Insert lunch break BEFORE return row if return drive passed lunch
        html += checkInsertLunch(returnMins);

        // Return to depot row
        if (depotAddr !== 'Not set') {
            const returnTimeDisplay = route.legStats && route.legStats.length > 0
                ? `<strong>${returnTimeStr}</strong>`
                : '—';
            html += `<tr style="background:#dbeafe"><td class="stop-num">🏠</td><td>${returnTimeDisplay}</td><td>—</td><td colspan="7"><strong>RETURN:</strong> ${depotAddr}</td></tr>`;
        }

        html += `<tr class="totals"><td></td><td></td><td>${totalLaborMins > 0 ? `${Math.round(totalLaborMins)} min labor` : ''}</td><td colspan="4">Total</td><td>${totalBags}</td><td colspan="2">Total time: ${totalTimeMins > 0 ? Math.round(totalTimeMins) + ' min' : '—'}</td></tr>`;
        html += `</tbody></table></div>`;
    }

    html += `</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
    }
}
