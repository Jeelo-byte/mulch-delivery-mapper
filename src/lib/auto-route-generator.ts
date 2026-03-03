import type { DeliveryStop, MulchType, Route, Vehicle, AppState } from './types';
import { nearestNeighborSort } from './route-optimizer';

const ROUTE_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e',
    '#a855f7', '#6366f1', '#0ea5e9', '#84cc16', '#d946ef',
];

let colorIndex = 0;
function nextColor(): string {
    const color = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length];
    colorIndex++;
    return color;
}

export interface SmartAutoConfig {
    /** Which vehicles to use, in priority order (typed first, hotshot last) */
    vehicleAssignments: {
        vehicleId: string;
        mulchType: MulchType | null; // null = hotshot (any type)
    }[];
    /** Depot coordinates for route starting point */
    depotCoords: [number, number] | null;
    /** Generation Strategy */
    strategy?: 'standard' | 'efficient';
}

interface AutoResult {
    routes: Route[];
    assignments: { stopId: string; routeId: string }[];
    errors: string[];
    summary: string[];
}

// ─── Runt-check threshold: dissolve if < 20% utilisation ────────────────────
const RUNT_THRESHOLD = 0.2;

/**
 * Smart auto-route generation using the HFVRP "Sweep & Pack" algorithm.
 *
 * Mulch-mode algorithm:
 *   1. Triage: push mixed-type orders to trailerPool
 *   2. Group single-type stops by mulchType; group typed vehicles by mulchType
 *   3. Sweep & Pack dedicated trucks per type (polar-angle sort → capacity pack)
 *   4. Runt Check: dissolve routes < 20% → trailerPool
 *   5. Trailer Consolidation: Sweep & Pack the trailerPool with Hotshot/Trailer vehicles
 *   6. Sequence each route via nearestNeighborSort
 *
 * Spreading-mode is handled separately via balanced split (unchanged).
 */
export function smartAutoGenerate(state: AppState, config: SmartAutoConfig): AutoResult {
    const errors: string[] = [];
    const summary: string[] = [];
    const routes: Route[] = [];
    const assignments: { stopId: string; routeId: string }[] = [];

    const isSpreadingMode = state.activeServiceMode === 'spreading';

    // ── 1. Collect unassigned, non-disabled stops ──────────────────────────────
    const allStops = state.stopOrder
        .map(id => state.stops[id])
        .filter(s => {
            if (!s || s.isDisabled) return false;
            if (isSpreadingMode) {
                return !s.spreadingRouteId && s.spreadingOrder && s.spreadingOrder.quantity > 0;
            }
            return !s.routeId;
        });

    if (allStops.length === 0) {
        errors.push(isSpreadingMode ? 'No unassigned spreading stops available.' : 'No unassigned stops available.');
        return { routes, assignments, errors, summary };
    }

    // ── Spreading mode: delegate to balanced-split approach ────────────────────
    if (isSpreadingMode) {
        return spreadingAutoGenerate(state, config, allStops, routes, assignments, errors, summary);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  MULCH-MODE: HFVRP Sweep & Pack
    // ══════════════════════════════════════════════════════════════════════════

    const assigned = new Set<string>();

    // Separate typed vs hotshot/trailer vehicles
    const typedVehicles = config.vehicleAssignments.filter(a => a.mulchType);
    const hotshotVehicles = config.vehicleAssignments.filter(a => !a.mulchType);

    // ── Phase 1: Triage (The Oddball Filter) ──────────────────────────────────
    const trailerPool: DeliveryStop[] = [];
    const standardPool: DeliveryStop[] = [];

    for (const stop of allStops) {
        const distinctTypes = new Set(stop.mulchOrders.map(o => o.mulchType));
        if (distinctTypes.size > 1) {
            // Mixed order → trailer pool
            trailerPool.push(stop);
        } else {
            standardPool.push(stop);
        }
    }

    if (trailerPool.length > 0) {
        summary.push(`Triage: ${trailerPool.length} mixed-type stop(s) sent to trailer pool.`);
    }

    // ── Phase 2: Group by mulchType ──────────────────────────────────────────
    const stopsByType = new Map<MulchType, DeliveryStop[]>();
    for (const stop of standardPool) {
        const mType = stop.mulchOrders[0]?.mulchType;
        if (!mType) {
            // No mulch orders (shouldn't happen, but safety)
            trailerPool.push(stop);
            continue;
        }
        if (!stopsByType.has(mType)) stopsByType.set(mType, []);
        stopsByType.get(mType)!.push(stop);
    }

    const vehiclesByType = new Map<MulchType, typeof typedVehicles>();
    for (const tv of typedVehicles) {
        const mt = tv.mulchType!;
        if (!vehiclesByType.has(mt)) vehiclesByType.set(mt, []);
        vehiclesByType.get(mt)!.push(tv);
    }

    // ── Phase 3: Sweep & Pack (Dedicated Trucks) ─────────────────────────────
    const tripCounts = new Map<string, number>();

    for (const [mulchType, typeStops] of Array.from(stopsByType.entries())) {
        const vehiclesForType = vehiclesByType.get(mulchType) || [];
        if (vehiclesForType.length === 0) {
            // No dedicated vehicle for this type — push all to trailer pool
            trailerPool.push(...typeStops);
            summary.push(`No dedicated vehicle for ${mulchType} — ${typeStops.length} stop(s) sent to trailer pool.`);
            continue;
        }

        // Sort vehicles: largest capacity first (efficient packing)
        if (config.strategy === 'efficient') {
            vehiclesForType.sort((a, b) => {
                const vA = state.vehicles[a.vehicleId];
                const vB = state.vehicles[b.vehicleId];
                return (vB?.maxBagCapacity ?? 0) - (vA?.maxBagCapacity ?? 0);
            });
        }

        // Sweep & Pack: polar angle sort → greedy capacity packing
        const sweepTrips = sweepAndPack(typeStops, vehiclesForType.map(v => state.vehicles[v.vehicleId]).filter(Boolean) as Vehicle[], config.depotCoords);

        let vehicleIdx = 0;
        for (const trip of sweepTrips) {
            const vehicleAssignment = vehiclesForType[vehicleIdx % vehiclesForType.length];
            const vehicle = state.vehicles[vehicleAssignment.vehicleId];
            if (!vehicle) continue;

            const tripBags = trip.reduce((s, stop) => s + stop.totalBags, 0);

            // ── Runt Check ──
            if (tripBags < vehicle.maxBagCapacity * RUNT_THRESHOLD && trip.length > 0) {
                trailerPool.push(...trip);
                summary.push(`Runt dissolved: ${trip.length} stop(s) (${tripBags} bags, ${Math.round((tripBags / vehicle.maxBagCapacity) * 100)}% of ${vehicle.name}) → trailer pool.`);
                continue;
            }

            // Finalize this route
            const tripCount = (tripCounts.get(vehicle.id) || 0) + 1;
            tripCounts.set(vehicle.id, tripCount);

            const routeId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            const routeName = `${vehicle.name} - ${mulchType} (Trip ${tripCount})`;

            const route: Route = {
                id: routeId,
                name: routeName,
                vehicleId: vehicle.id,
                mulchType: mulchType as MulchType,
                serviceMode: 'mulch',
                stopIds: [],
                color: nextColor(),
                visible: true,
                optimized: false,
                routeGeometry: null,
                distanceMiles: null,
                durationMinutes: null,
            };
            routes.push(route);

            // Sequence stops within trip via nearest-neighbor
            const ordered = optimizeTripOrder(trip, config.depotCoords, state.stops);
            for (const stopId of ordered) {
                assignments.push({ stopId, routeId });
                assigned.add(stopId);
            }

            summary.push(`Created: ${routeName} (${trip.length} stops, ${tripBags} bags)`);
            vehicleIdx++;
        }
    }

    // ── Phase 4: Trailer Consolidation ───────────────────────────────────────
    // Remove any stops that were already assigned (shouldn't be, but safety)
    const unassignedTrailer = trailerPool.filter(s => !assigned.has(s.id));

    if (unassignedTrailer.length > 0 && hotshotVehicles.length > 0) {
        const trailerVehicles = hotshotVehicles
            .map(a => state.vehicles[a.vehicleId])
            .filter(Boolean) as Vehicle[];

        if (config.strategy === 'efficient') {
            trailerVehicles.sort((a, b) => (b.maxBagCapacity ?? 0) - (a.maxBagCapacity ?? 0));
        }

        const trailerTrips = sweepAndPack(unassignedTrailer, trailerVehicles, config.depotCoords);

        let tVehicleIdx = 0;
        for (const trip of trailerTrips) {
            const vehicle = trailerVehicles[tVehicleIdx % trailerVehicles.length];
            if (!vehicle) continue;

            const tripCount = (tripCounts.get(vehicle.id) || 0) + 1;
            tripCounts.set(vehicle.id, tripCount);

            const routeId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            const routeName = `${vehicle.name} - Hotshot (Trip ${tripCount})`;
            const tripBags = trip.reduce((s, stop) => s + stop.totalBags, 0);

            const route: Route = {
                id: routeId,
                name: routeName,
                vehicleId: vehicle.id,
                mulchType: null,
                serviceMode: 'mulch',
                stopIds: [],
                color: nextColor(),
                visible: true,
                optimized: false,
                routeGeometry: null,
                distanceMiles: null,
                durationMinutes: null,
            };
            routes.push(route);

            const ordered = optimizeTripOrder(trip, config.depotCoords, state.stops);
            for (const stopId of ordered) {
                assignments.push({ stopId, routeId });
                assigned.add(stopId);
            }

            summary.push(`Created: ${routeName} (${trip.length} stops, ${tripBags} bags)`);
            tVehicleIdx++;
        }
    } else if (unassignedTrailer.length > 0 && hotshotVehicles.length === 0) {
        // No trailer/hotshot vehicles — try to overflow into typed vehicles
        for (const stop of unassignedTrailer) {
            if (assigned.has(stop.id)) continue;
            const primaryType = stop.mulchOrders[0]?.mulchType;
            const tv = typedVehicles.find(a => a.mulchType === primaryType);
            const vehicleId = tv?.vehicleId || typedVehicles[0]?.vehicleId;
            const vehicle = vehicleId ? state.vehicles[vehicleId] : null;

            if (vehicle) {
                const tripCount = (tripCounts.get(vehicle.id) || 0) + 1;
                tripCounts.set(vehicle.id, tripCount);

                const routeId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                const route: Route = {
                    id: routeId,
                    name: `${vehicle.name} - Overflow (Trip ${tripCount})`,
                    vehicleId: vehicle.id,
                    mulchType: primaryType || null,
                    serviceMode: 'mulch',
                    stopIds: [],
                    color: nextColor(),
                    visible: true,
                    optimized: false,
                    routeGeometry: null,
                    distanceMiles: null,
                    durationMinutes: null,
                };
                routes.push(route);
                assignments.push({ stopId: stop.id, routeId });
                assigned.add(stop.id);
            }
        }

        const stillUnassigned = unassignedTrailer.filter(s => !assigned.has(s.id));
        if (stillUnassigned.length > 0) {
            errors.push(`${stillUnassigned.length} stop(s) could not be assigned — no suitable vehicle.`);
        }
    }

    // ── Final leftovers check ────────────────────────────────────────────────
    const finalLeftovers = allStops.filter(s => !assigned.has(s.id));
    if (finalLeftovers.length > 0) {
        errors.push(`${finalLeftovers.length} stop(s) remain unassigned.`);
    }

    if (routes.length === 0) {
        errors.push('Could not generate any routes with the current configuration.');
    }

    return { routes, assignments, errors, summary };
}

// ══════════════════════════════════════════════════════════════════════════════
//  SWEEP & PACK helper
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Sweep & Pack algorithm for a homogeneous pool of stops.
 *
 * 1. Compute polar angle of each stop relative to depot
 * 2. Sort by angle (circular sweep)
 * 3. Greedily pack stops into trips up to each vehicle's maxBagCapacity
 * 4. Trip-merge pass: consolidate small adjacent trips to reduce fragmentation
 *
 * Returns an array of stop-groups (trips). The caller assigns each trip to a
 * vehicle and performs the runt check.
 */
function sweepAndPack(
    stops: DeliveryStop[],
    vehicles: Vehicle[],
    depotCoords: [number, number] | null,
): DeliveryStop[][] {
    if (stops.length === 0 || vehicles.length === 0) return [];

    const withCoords = stops.filter(s => s.coordinates);
    const noCoords = stops.filter(s => !s.coordinates);

    // Depot reference (fallback to centroid)
    const depot = depotCoords
        ? { lat: depotCoords[1], lng: depotCoords[0] }
        : withCoords.length > 0
            ? {
                lat: withCoords.reduce((s, st) => s + st.coordinates![1], 0) / withCoords.length,
                lng: withCoords.reduce((s, st) => s + st.coordinates![0], 0) / withCoords.length,
            }
            : { lat: 0, lng: 0 };

    // Compute polar angle for each stop
    const withAngles = withCoords.map(stop => ({
        stop,
        angle: Math.atan2(stop.coordinates![1] - depot.lat, stop.coordinates![0] - depot.lng),
    }));

    // Sort by polar angle (ascending) — creates the circular sweep
    withAngles.sort((a, b) => a.angle - b.angle);

    // Representative vehicle capacity (use largest for initial packing)
    const maxCap = vehicles.reduce((best, v) => Math.max(best, v.maxBagCapacity ?? 0), 0) || Infinity;

    // ── Pass 1: Greedy capacity packing ─────────────────────────────────────
    const rawTrips: DeliveryStop[][] = [];
    let currentTrip: DeliveryStop[] = [];
    let currentBags = 0;

    for (const { stop } of withAngles) {
        const stopBags = stop.totalBags;
        if (currentTrip.length > 0 && currentBags + stopBags > maxCap) {
            rawTrips.push(currentTrip);
            currentTrip = [];
            currentBags = 0;
        }
        currentTrip.push(stop);
        currentBags += stopBags;
    }
    if (currentTrip.length > 0) rawTrips.push(currentTrip);

    // ── Pass 2: Trip-merge — consolidate small adjacent trips ────────────────
    // Iterate through adjacent trip pairs (in angular order). If two neighbours
    // fit within one vehicle's capacity, merge them. Repeat until stable.
    let merged = true;
    while (merged) {
        merged = false;
        for (let i = 0; i < rawTrips.length - 1; i++) {
            const a = rawTrips[i];
            const b = rawTrips[i + 1];
            const bagA = a.reduce((s, st) => s + st.totalBags, 0);
            const bagB = b.reduce((s, st) => s + st.totalBags, 0);
            if (bagA + bagB <= maxCap) {
                // Merge b into a
                rawTrips[i] = [...a, ...b];
                rawTrips.splice(i + 1, 1);
                merged = true;
                break; // restart scan after any merge
            }
        }
    }

    const trips = rawTrips;

    // ── Append non-geocoded stops to the lightest existing trip ──────────────
    if (noCoords.length > 0) {
        for (const stop of noCoords) {
            const stopBags = stop.totalBags;
            // Find the trip with fewest bags that still has room
            let bestTripIdx = -1;
            let bestBags = Infinity;
            for (let i = 0; i < trips.length; i++) {
                const tb = trips[i].reduce((s, st) => s + st.totalBags, 0);
                if (tb + stopBags <= maxCap && tb < bestBags) {
                    bestBags = tb;
                    bestTripIdx = i;
                }
            }
            if (bestTripIdx === -1) {
                // No trip has room — start a new one
                trips.push([stop]);
            } else {
                trips[bestTripIdx].push(stop);
            }
        }
    }

    return trips;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SPREADING MODE (balanced split – kept from original implementation)
// ══════════════════════════════════════════════════════════════════════════════

function spreadingAutoGenerate(
    state: AppState,
    config: SmartAutoConfig,
    allStops: DeliveryStop[],
    routes: Route[],
    assignments: { stopId: string; routeId: string }[],
    errors: string[],
    summary: string[],
): AutoResult {
    const assigned = new Set<string>();
    const hotshotVehicles = config.vehicleAssignments.filter(a => !a.mulchType);

    // For spreading, all vehicles act like hotshots (no mulch type constraint)
    const allVehicles = config.vehicleAssignments.length > 0
        ? config.vehicleAssignments
        : hotshotVehicles;

    const vehicleList = allVehicles
        .map(a => state.vehicles[a.vehicleId])
        .filter(Boolean) as Vehicle[];

    if (vehicleList.length === 0) {
        errors.push('No spreading vehicles available.');
        return { routes, assignments, errors, summary };
    }

    const groups = spreadingBalancedSplit(allStops, vehicleList.length, config.depotCoords);
    const tripCounts = new Map<string, number>();

    for (let gi = 0; gi < groups.length; gi++) {
        const trip = groups[gi];
        if (trip.length === 0) continue;
        const vehicle = vehicleList[gi % vehicleList.length];
        const tripCount = (tripCounts.get(vehicle.id) || 0) + 1;
        tripCounts.set(vehicle.id, tripCount);

        const routeId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const route: Route = {
            id: routeId,
            name: `${vehicle.name} - Route ${tripCount}`,
            vehicleId: vehicle.id,
            mulchType: null,
            serviceMode: 'spreading',
            stopIds: [],
            color: nextColor(),
            visible: true,
            optimized: false,
            routeGeometry: null,
            distanceMiles: null,
            durationMinutes: null,
        };
        routes.push(route);

        const ordered = optimizeTripOrder(trip, config.depotCoords, state.stops);
        for (const stopId of ordered) {
            assignments.push({ stopId, routeId });
            assigned.add(stopId);
        }

        const totalSpreadBags = trip.reduce((s, stop) => s + (stop.spreadingOrder?.quantity || 0), 0);
        summary.push(`Created: ${route.name} (${trip.length} stops, ${totalSpreadBags} bags to spread)`);
    }

    const finalLeftovers = allStops.filter(s => !assigned.has(s.id));
    if (finalLeftovers.length > 0) {
        errors.push(`${finalLeftovers.length} spreading stop(s) remain unassigned.`);
    }
    if (routes.length === 0) {
        errors.push('Could not generate any spreading routes with the current configuration.');
    }

    return { routes, assignments, errors, summary };
}

/**
 * Spreading-specific balanced split.
 *
 * Priority: STRICTLY equal bag totals per vehicle first, then geographic cohesion
 * as a tie-breaker when buckets are within 3 bags of each other.
 *
 * Algorithm:
 * 1. Sort stops by polar angle from depot (keeps geographically close stops adjacent)
 * 2. Always assign to the bucket with fewest bags; only prefer geography when bag
 *    counts are within a very small absolute tolerance (3 bags)
 * 3. Post-rebalancing pass: move stops from heaviest to lightest bucket to even out
 *    any residual imbalance left by large stops
 */
function spreadingBalancedSplit(
    stops: DeliveryStop[],
    numBuckets: number,
    depotCoords: [number, number] | null,
): DeliveryStop[][] {
    if (numBuckets <= 0 || stops.length === 0) return [stops];
    if (numBuckets === 1) return [stops];

    const withCoords = stops.filter(s => s.coordinates);
    const noCoords = stops.filter(s => !s.coordinates);

    const ref: [number, number] = depotCoords || (withCoords.length > 0
        ? [
            withCoords.reduce((s, stop) => s + stop.coordinates![0], 0) / withCoords.length,
            withCoords.reduce((s, stop) => s + stop.coordinates![1], 0) / withCoords.length,
        ]
        : [0, 0]);

    // Sort by polar angle (same sweep as delivery — keeps neighbours together)
    const depot = { lat: ref[1], lng: ref[0] };
    const sorted = [...withCoords].sort((a, b) => {
        const angA = Math.atan2(a.coordinates![1] - depot.lat, a.coordinates![0] - depot.lng);
        const angB = Math.atan2(b.coordinates![1] - depot.lat, b.coordinates![0] - depot.lng);
        return angA - angB;
    });

    const buckets: DeliveryStop[][] = Array.from({ length: numBuckets }, () => []);
    const bucketBags: number[] = new Array(numBuckets).fill(0);

    const getBags = (s: DeliveryStop) => s.spreadingOrder?.quantity || 0;

    const centroid = (bucket: DeliveryStop[]): [number, number] => {
        const withC = bucket.filter(s => s.coordinates);
        if (withC.length === 0) return ref;
        return [
            withC.reduce((sum, s) => sum + s.coordinates![0], 0) / withC.length,
            withC.reduce((sum, s) => sum + s.coordinates![1], 0) / withC.length,
        ];
    };

    // ── Pass 1: Strict bag-balance assignment ────────────────────────────────
    // Absolute tolerance: only allow geographic preference when buckets are
    // within BAG_TIE_TOLERANCE bags of each other.
    const BAG_TIE_TOLERANCE = 3;

    for (const stop of sorted) {
        const bags = getBags(stop);
        const stopCoord = stop.coordinates!;

        // Find the minimum bag count
        const minBags = Math.min(...bucketBags);

        // Candidates: buckets within BAG_TIE_TOLERANCE of the minimum
        const candidates: number[] = [];
        for (let i = 0; i < numBuckets; i++) {
            if (bucketBags[i] - minBags <= BAG_TIE_TOLERANCE) candidates.push(i);
        }

        // Among candidates, pick the one whose centroid is closest to this stop
        let bestIdx = candidates[0];
        let bestDist = dist(stopCoord, centroid(buckets[candidates[0]]));
        for (let ci = 1; ci < candidates.length; ci++) {
            const i = candidates[ci];
            const d = dist(stopCoord, centroid(buckets[i]));
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }

        buckets[bestIdx].push(stop);
        bucketBags[bestIdx] += bags;
    }

    // No-coord stops: always go to the lightest bucket
    for (const stop of noCoords) {
        const bags = getBags(stop);
        const minIdx = bucketBags.indexOf(Math.min(...bucketBags));
        buckets[minIdx].push(stop);
        bucketBags[minIdx] += bags;
    }

    // ── Pass 2: Post-rebalancing ─────────────────────────────────────────────
    // Try moving single stops from the heaviest bucket to the lightest to
    // reduce imbalance without creating geographic chaos. Repeat until stable.
    let improved = true;
    while (improved) {
        improved = false;
        const maxIdx = bucketBags.indexOf(Math.max(...bucketBags));
        const minIdx = bucketBags.indexOf(Math.min(...bucketBags));
        const imbalance = bucketBags[maxIdx] - bucketBags[minIdx];
        if (imbalance <= BAG_TIE_TOLERANCE) break;

        // Find the stop in the heaviest bucket whose move would most improve balance
        let bestMoveIdx = -1;
        let bestImprovement = 0;
        for (let si = 0; si < buckets[maxIdx].length; si++) {
            const stop = buckets[maxIdx][si];
            const bags = getBags(stop);
            // Only move if it actually reduces imbalance
            const newMaxBags = bucketBags[maxIdx] - bags;
            const newMinBags = bucketBags[minIdx] + bags;
            const newImbalance = Math.abs(newMaxBags - newMinBags);
            const improvement = imbalance - newImbalance;
            if (improvement > bestImprovement) {
                bestImprovement = improvement;
                bestMoveIdx = si;
            }
        }

        if (bestMoveIdx !== -1) {
            const [stop] = buckets[maxIdx].splice(bestMoveIdx, 1);
            const bags = getBags(stop);
            buckets[minIdx].push(stop);
            bucketBags[maxIdx] -= bags;
            bucketBags[minIdx] += bags;
            improved = true;
        }
    }

    return buckets.filter(b => b.length > 0);
}

// ══════════════════════════════════════════════════════════════════════════════
//  SHARED HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/** Optimize stop order within a trip: nearest-neighbor from depot */
function optimizeTripOrder(
    stops: DeliveryStop[],
    depotCoords: [number, number] | null,
    allStops: Record<string, DeliveryStop>
): string[] {
    const withCoords = stops.filter(s => s.coordinates);
    const noCoords = stops.filter(s => !s.coordinates);

    if (withCoords.length >= 2) {
        const sorted = nearestNeighborSort(withCoords, depotCoords || undefined);
        return [...sorted, ...noCoords.map(s => s.id)];
    }

    return stops.map(s => s.id);
}

/** Haversine distance in km */
function dist(a: [number, number], b: [number, number]): number {
    const R = 6371;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

// ──── Legacy simple auto-generator (kept for backward compat) ────

export interface AutoRouteConfig {
    groupBy: 'mulchType' | 'postalCode' | 'proximity';
    vehicleId: string;
    maxBagsPerRoute: number;
    mulchTypeFilter?: MulchType;
}

export function autoGenerateRoutes(
    state: AppState,
    config: AutoRouteConfig
): { routes: Route[]; assignments: { stopId: string; routeId: string }[]; errors: string[] } {
    // Delegate to smart generator with a single vehicle
    const result = smartAutoGenerate(state, {
        vehicleAssignments: [{ vehicleId: config.vehicleId, mulchType: config.mulchTypeFilter || null }],
        depotCoords: null,
    });
    return { routes: result.routes, assignments: result.assignments, errors: result.errors };
}
