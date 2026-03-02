'use client';

import type { AppState, Route } from './types';

export interface StopETA {
    stopId: string;
    index: number;
    etaStr: string;
    /** Minutes of labor/unloading at this stop */
    timeAtStop: number;
    /** Total elapsed minutes from route start when arriving at this stop */
    cumulativeMins: number;
}

/**
 * Compute ETA information for every stop in a route.
 * Accounts for: initial depot drive, inter-leg drive times, labor at each stop,
 * and a single lunch break.
 */
export function computeRouteETAs(route: Route, state: AppState): StopETA[] {
    const settings = state.settings;
    const isSpreadingRoute = route.serviceMode === 'spreading';

    const rawStart = isSpreadingRoute
        ? (settings.spreadingStartTime || '09:00')
        : (settings.deliveryStartTime || '08:00');

    const startMins = rawStart.split(':').reduce((h, m) => h * 60 + Number(m), 0);
    const lunchStartMins = (settings.lunchBreakStartTime || '12:00')
        .split(':').reduce((h, m) => h * 60 + Number(m), 0);
    const lunchDuration = settings.lunchBreakDuration ?? 30;
    const laborPerSpreadBag = settings.laborTimePerSpreadBag ?? 3;
    const laborPerDeliveryBag = settings.timeSpentPerDeliveryBag ?? 2;

    const legOffset = settings.depotCoords ? 1 : 0;

    let currentMins = startMins;
    let hasTakenLunch = false;

    // Add initial depot → first stop leg
    if (route.legStats?.[0] && settings.depotCoords) {
        currentMins += route.legStats[0].durationMinutes;
    }

    const results: StopETA[] = [];

    route.stopIds.forEach((stopId, idx) => {
        const stop = state.stops[stopId];
        if (!stop) return;

        // Add inter-stop drive time (skipped for stop 0 because we already added depot leg)
        if (idx > 0 && route.legStats) {
            const leg = route.legStats[idx - 1 + legOffset];
            if (leg) currentMins += leg.durationMinutes;
        }

        // Check for lunch break (applies when we first pass lunchStartMins)
        if (!hasTakenLunch && currentMins >= lunchStartMins) {
            currentMins += lunchDuration;
            hasTakenLunch = true;
        }

        const arrivalMins = currentMins;

        // Compute time at this stop (labor)
        let timeAtStop = 0;
        if (isSpreadingRoute && stop.spreadingOrder) {
            timeAtStop = stop.spreadingOrder.quantity * laborPerSpreadBag;
        } else if (!isSpreadingRoute) {
            timeAtStop = stop.totalBags * laborPerDeliveryBag;
        }

        results.push({
            stopId,
            index: idx,
            etaStr: formatMinutes(arrivalMins),
            timeAtStop,
            cumulativeMins: arrivalMins,
        });

        // Advance clock by labor time so next stop's drive time starts after departure
        currentMins += timeAtStop;
    });

    return results;
}

export function formatMinutes(totalMins: number): string {
    const m = Math.round(totalMins);
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    const isPM = h >= 12;
    const h12 = h % 12 || 12;
    return `${h12}:${min.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
}
