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
    /**
     * Absolute minutes from the delivery date's 00:00.
     * Use this for cross-route dependency comparisons that may span different dates.
     */
    absoluteMins: number;
}

export interface RouteLunchBreak {
    startMins: number;
    durationMins: number;
}

export interface RouteETAResult {
    stops: StopETA[];
    lunchBreak?: RouteLunchBreak;
}

/**
 * Returns the number of minutes difference between two ISO date strings (YYYY-MM-DD).
 * Positive = dateB is after dateA.
 */
function dateDiffMins(dateA: string, dateB: string): number {
    const a = new Date(dateA + 'T00:00:00').getTime();
    const b = new Date(dateB + 'T00:00:00').getTime();
    return (b - a) / 60000;
}

/**
 * Get the absolute start time in minutes from the delivery date 00:00 for a given route.
 * Spreading routes may start on a different date (spreadingDate) so their absolute
 * start time factors in the date offset relative to deliveryDate.
 */
export function getRouteAbsoluteStartMins(route: Route, state: AppState): number {
    const settings = state.settings;
    const isSpreadingRoute = route.serviceMode === 'spreading';

    const rawTime = isSpreadingRoute
        ? (settings.spreadingStartTime || '09:00')
        : (settings.deliveryStartTime || '08:00');
    const timeMins = rawTime.split(':').reduce((h: number, m: string) => h * 60 + Number(m), 0);

    const deliveryDate = settings.deliveryDate || new Date().toISOString().split('T')[0];
    const routeDate = isSpreadingRoute
        ? (settings.spreadingDate || deliveryDate)
        : deliveryDate;

    const dateOffset = dateDiffMins(deliveryDate, routeDate);
    return dateOffset + timeMins;
}

/**
 * Extract the trip number from a route name, e.g. "Truck A - Black (Trip 2)" → 2.
 * Returns 1 if no trip number is found.
 */
function extractTripNumber(routeName: string): number {
    const match = routeName.match(/Trip\s+(\d+)\s*\)?$/i);
    return match ? parseInt(match[1], 10) : 1;
}

/**
 * Compute the effective wall-clock start time (minutes from midnight) for a given route,
 * chaining from the end of any prior trips for the same vehicle.
 *
 * This is the single source of truth for "when does this route actually start?".
 * Both computeRouteETAs and computeRouteEndMins must use this to stay in sync.
 */
export function computeRouteEffectiveStartMins(route: Route, state: AppState): number {
    const settings = state.settings;
    const isSpreadingRoute = route.serviceMode === 'spreading';

    const rawStart = isSpreadingRoute
        ? (settings.spreadingStartTime || '09:00')
        : (settings.deliveryStartTime || '08:00');
    const configuredStartMins = rawStart.split(':').reduce((h: number, m: string) => h * 60 + Number(m), 0);

    const myTripNumber = extractTripNumber(route.name);
    if (myTripNumber <= 1) return configuredStartMins;

    // Find prior trips for the same vehicle + service mode, ordered by trip number
    const priorTrips = Object.values(state.routes)
        .filter(r =>
            r.id !== route.id &&
            r.vehicleId === route.vehicleId &&
            r.serviceMode === route.serviceMode &&
            extractTripNumber(r.name) < myTripNumber,
        )
        .sort((a, b) => extractTripNumber(a.name) - extractTripNumber(b.name));

    // Build a chain: compute end times for all prior trips sequentially
    let chainStart = configuredStartMins;
    for (const sibling of priorTrips) {
        chainStart = computeRouteEndMins(sibling, state, chainStart);
    }
    return chainStart;
}

/**
 * Compute the wall-clock time (minutes from midnight) when the crew returns to depot
 * after completing all stops on the route.
 *
 * Includes: depot→stop[0] drive, all inter-stop drives, all labor, one lunch break
 * if applicable, and the last-stop→depot return drive.
 *
 * @param route      The route to measure.
 * @param state      Full app state.
 * @param startMins  Override the effective start time (used when chaining trips).
 */
export function computeRouteEndMins(
    route: Route,
    state: AppState,
    startMins?: number,
): number {
    const settings = state.settings;
    const isSpreadingRoute = route.serviceMode === 'spreading';

    const rawStart = isSpreadingRoute
        ? (settings.spreadingStartTime || '09:00')
        : (settings.deliveryStartTime || '08:00');
    const configuredStart = rawStart.split(':').reduce((h: number, m: string) => h * 60 + Number(m), 0);

    const effectiveStart = startMins ?? configuredStart;

    const lunchStartMins = (settings.lunchBreakStartTime || '12:00')
        .split(':').reduce((h: number, m: string) => h * 60 + Number(m), 0);
    const lunchDuration = settings.lunchBreakDuration ?? 30;
    const laborPerSpreadBag = settings.laborTimePerSpreadBag ?? 3;
    const laborPerDeliveryBag = settings.timeSpentPerDeliveryBag ?? 2;

    const legOffset = settings.depotCoords ? 1 : 0;

    let currentMins = effectiveStart;
    // If trip starts at or after lunch, the break is already behind us
    let hasTakenLunch = effectiveStart >= lunchStartMins;

    // Add initial depot → first stop leg
    if (route.legStats?.[0] && settings.depotCoords) {
        currentMins += route.legStats[0].durationMinutes;
        if (!hasTakenLunch && currentMins >= lunchStartMins) {
            currentMins += lunchDuration;
            hasTakenLunch = true;
        }
    }

    route.stopIds.forEach((stopId, idx) => {
        const stop = state.stops[stopId];
        if (!stop) return;

        // Add inter-stop drive time
        if (idx > 0 && route.legStats) {
            const leg = route.legStats[idx - 1 + legOffset];
            if (leg) {
                currentMins += leg.durationMinutes;
                if (!hasTakenLunch && currentMins >= lunchStartMins) {
                    currentMins += lunchDuration;
                    hasTakenLunch = true;
                }
            }
        }

        // Labor at stop
        let timeAtStop = 0;
        if (isSpreadingRoute && stop.spreadingOrder) {
            timeAtStop = stop.spreadingOrder.quantity * laborPerSpreadBag;
        } else if (!isSpreadingRoute) {
            timeAtStop = stop.totalBags * laborPerDeliveryBag;
        }

        currentMins += timeAtStop;
        if (!hasTakenLunch && currentMins >= lunchStartMins) {
            currentMins += lunchDuration;
            hasTakenLunch = true;
        }
    });

    // Add last stop → depot return leg
    if (settings.depotCoords && route.legStats && route.legStats.length > 0) {
        const lastLeg = route.legStats[route.legStats.length - 1];
        if (lastLeg) {
            currentMins += lastLeg.durationMinutes;
            if (!hasTakenLunch && currentMins >= lunchStartMins) {
                currentMins += lunchDuration;
                hasTakenLunch = true;
            }
        }
    }

    return currentMins;
}

/**
 * Compute ETA information for every stop in a route.
 * Accounts for: initial depot drive, inter-leg drive times, labor at each stop,
 * a single lunch break, and — for vehicles with multiple trips — the end time
 * of the *previous* trip as the start of this one.
 */
export function computeRouteETAs(route: Route, state: AppState): RouteETAResult {
    const settings = state.settings;
    const isSpreadingRoute = route.serviceMode === 'spreading';

    const rawStart = isSpreadingRoute
        ? (settings.spreadingStartTime || '09:00')
        : (settings.deliveryStartTime || '08:00');

    const configuredStartMins = rawStart.split(':').reduce((h: number, m: string) => h * 60 + Number(m), 0);
    const lunchStartMins = (settings.lunchBreakStartTime || '12:00')
        .split(':').reduce((h: number, m: string) => h * 60 + Number(m), 0);
    const lunchDuration = settings.lunchBreakDuration ?? 30;
    const laborPerSpreadBag = settings.laborTimePerSpreadBag ?? 3;
    const laborPerDeliveryBag = settings.timeSpentPerDeliveryBag ?? 2;

    const legOffset = settings.depotCoords ? 1 : 0;

    // The single source of truth for when this route's clock starts
    const effectiveStartMins = computeRouteEffectiveStartMins(route, state);

    // Absolute start = minutes from deliveryDate 00:00 (accounts for date offsets)
    const absoluteStart = getRouteAbsoluteStartMins(route, state);
    // Adjust absoluteStart for the actual start offset vs the configured start
    const startDelta = effectiveStartMins - configuredStartMins;

    let currentMins = effectiveStartMins;
    // If the trip starts at or after lunch, the break is already behind us
    let hasTakenLunch = effectiveStartMins >= lunchStartMins;

    let lunchBreak: RouteLunchBreak | undefined;

    // Add initial depot → first stop leg
    if (route.legStats?.[0] && settings.depotCoords) {
        currentMins += route.legStats[0].durationMinutes;
        if (!hasTakenLunch && currentMins >= lunchStartMins) {
            lunchBreak = { startMins: currentMins, durationMins: lunchDuration };
            currentMins += lunchDuration;
            hasTakenLunch = true;
        }
    }

    const results: StopETA[] = [];

    route.stopIds.forEach((stopId, idx) => {
        const stop = state.stops[stopId];
        if (!stop) return;

        // Add inter-stop drive time (skipped for stop 0 because we already added depot leg)
        if (idx > 0 && route.legStats) {
            const leg = route.legStats[idx - 1 + legOffset];
            if (leg) {
                currentMins += leg.durationMinutes;
                if (!hasTakenLunch && currentMins >= lunchStartMins) {
                    lunchBreak = { startMins: currentMins, durationMins: lunchDuration };
                    currentMins += lunchDuration;
                    hasTakenLunch = true;
                }
            }
        }

        const arrivalMins = currentMins;
        // absoluteMins = minutes since deliveryDate 00:00 (cross-day comparable)
        const absoluteMins = absoluteStart + startDelta + (arrivalMins - effectiveStartMins);

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
            absoluteMins,
        });

        // Advance clock by labor time
        currentMins += timeAtStop;
        if (!hasTakenLunch && currentMins >= lunchStartMins) {
            lunchBreak = { startMins: currentMins, durationMins: lunchDuration };
            currentMins += lunchDuration;
            hasTakenLunch = true;
        }
    });

    // Check if lunch happens during the return leg
    if (!hasTakenLunch && settings.depotCoords && route.legStats && route.legStats.length > 0) {
        const lastLeg = route.legStats[route.legStats.length - 1];
        if (lastLeg) {
            if (currentMins + lastLeg.durationMinutes >= lunchStartMins) {
                lunchBreak = { startMins: currentMins + lastLeg.durationMinutes, durationMins: lunchDuration };
                hasTakenLunch = true;
            }
        }
    }

    return { stops: results, lunchBreak };
}

export function formatMinutes(totalMins: number): string {
    const m = Math.round(totalMins);
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    const isPM = h >= 12;
    const h12 = h % 12 || 12;
    return `${h12}:${min.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
}
