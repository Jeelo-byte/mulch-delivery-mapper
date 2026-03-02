'use client';

import type { AppState, Route, DeliveryStop } from './types';

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
        'Trip #',
        'Stop #',
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
        'Route Duration (min)',
        'Estimated Fuel Cost',
    ];

    const rows: string[][] = [headers];
    const fuelRate = state.settings.fuelCostPerMile;

    for (const route of routes) {
        const vehicle = state.vehicles[route.vehicleId];
        const fuelCost = route.distanceMiles ? (route.distanceMiles * fuelRate).toFixed(2) : '';

        route.stopIds.forEach((stopId, idx) => {
            const stop = state.stops[stopId];
            if (!stop) return;

            // One row per mulch order at this stop
            if (stop.mulchOrders.length > 0) {
                for (const order of stop.mulchOrders) {
                    rows.push([
                        route.name,
                        vehicle?.name || '',
                        '', // trip # (part of route name)
                        String(idx + 1),
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
                    '',
                    String(idx + 1),
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
    const routes = routeIds
        ? routeIds.map(id => state.routes[id]).filter(Boolean)
        : Object.values(state.routes);

    const fuelRate = state.settings.fuelCostPerMile;
    const depotAddr = state.settings.depotAddress || 'Not set';

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
    .mulch-black { background: #1f2937; color: white; }
    .mulch-cedar { background: #d97706; color: white; }
    .mulch-hardwood { background: #92400e; color: white; }
    .totals { font-weight: 700; background: #e5e7eb; }
    .notes { font-size: 10px; color: #888; font-style: italic; }
    @media print { .no-print { display: none; } body { margin: 10px; } }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
<h1>🌲 Mulch Delivery Route Sheet</h1>
<div class="header-meta">
    Generated: ${new Date().toLocaleString()}<br>
    Depot: ${depotAddr}<br>
    Total Routes: ${routes.length}
</div>`;

    for (const route of routes) {
        const vehicle = state.vehicles[route.vehicleId];
        const totalBags = route.stopIds.reduce(
            (sum, id) => sum + (state.stops[id]?.totalBags || 0), 0
        );
        const fuelCost = route.distanceMiles ? (route.distanceMiles * fuelRate).toFixed(2) : '—';

        const mulchClass = (t: string) => {
            if (t.toLowerCase().includes('black')) return 'mulch-black';
            if (t.toLowerCase().includes('cedar')) return 'mulch-cedar';
            return 'mulch-hardwood';
        };

        html += `
<div class="route-section">
    <div class="route-title" style="border-color:${route.color}">${route.name}</div>
    <div class="route-info">
        Vehicle: ${vehicle?.name || '—'} | 
        Stops: ${route.stopIds.length} | 
        Total Bags: ${totalBags} | 
        Miles: ${route.distanceMiles?.toFixed(1) || '—'} | 
        Time: ${route.durationMinutes ? Math.round(route.durationMinutes) + ' min' : '—'} | 
        Fuel: $${fuelCost}
        ${route.mulchType ? ` | Type: ${route.mulchType}` : ''}
    </div>
    <table>
        <thead><tr>
            <th>#</th>
            <th>Recipient</th>
            <th>Address</th>
            <th>Zip</th>
            <th>Mulch</th>
            <th>Qty</th>
            <th>Map Link</th>
            <th>Notes / Instructions</th>
        </tr></thead>
        <tbody>`;

        // Depot start row
        if (depotAddr !== 'Not set') {
            html += `<tr style="background:#dbeafe"><td class="stop-num">🏠</td><td colspan="7"><strong>START:</strong> ${depotAddr}</td></tr>`;
        }

        route.stopIds.forEach((stopId, idx) => {
            const stop = state.stops[stopId];
            if (!stop) return;

            const streetAddr = stop.fullAddress.split(',')[0]?.trim() || stop.fullAddress;
            const mulchInfo = stop.mulchOrders.map(o =>
                `<span class="mulch-tag ${mulchClass(o.mulchType)}">${o.mulchType}</span>`
            ).join(' ');
            const qtyInfo = stop.mulchOrders.map(o => o.quantity).join(', ');
            const mapLink = `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.fullAddress)}" target="_blank" style="color: #3b82f6; text-decoration: underline;">Open Map</a>`;
            const notesArr = [
                ...stop.mulchOrders.flatMap(o => o.placementInstructions),
                stop.fulfillmentNotes,
            ].filter(Boolean);

            html += `<tr>
                <td class="stop-num">${idx + 1}</td>
                <td>${stop.recipientName}</td>
                <td>${streetAddr}</td>
                <td>${stop.postalCode}</td>
                <td>${mulchInfo}</td>
                <td>${qtyInfo}</td>
                <td>${mapLink}</td>
                <td class="notes">${notesArr.join('; ') || '—'}</td>
            </tr>`;
        });

        // Depot end row
        if (depotAddr !== 'Not set') {
            html += `<tr style="background:#dbeafe"><td class="stop-num">🏠</td><td colspan="7"><strong>RETURN:</strong> ${depotAddr}</td></tr>`;
        }

        html += `<tr class="totals"><td></td><td colspan="4">Total</td><td>${totalBags}</td><td colspan="2"></td></tr>`;
        html += `</tbody></table></div>`;
    }

    html += `</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
    }
}
