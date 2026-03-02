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

/**
 * Smart auto-route generation.
 *
 * Algorithm:
 * 1. Collect all unassigned, non-disabled stops
 * 2. For each typed vehicle: collect stops that have that mulch type
 * 3. Geographically cluster stops, then chunk by vehicle capacity → multiple trips
 * 4. Leftover stops (types no vehicle is dedicated to, or overflow) → hotshot
 * 5. Sort stops within each trip by nearest-neighbor from depot
 * 6. Name trips as "VehicleName Trip 1", "VehicleName Trip 2", etc.
 */
export function smartAutoGenerate(state: AppState, config: SmartAutoConfig): AutoResult {
    const errors: string[] = [];
    const summary: string[] = [];
    const routes: Route[] = [];
    const assignments: { stopId: string; routeId: string }[] = [];

    const isSpreadingMode = state.activeServiceMode === 'spreading';

    // 1. Collect unassigned, non-disabled stops.
    // In spreading mode, check spreadingRouteId — stops may already be on a
    // mulch delivery route (routeId) but still be unassigned for spreading.
    let allStops = state.stopOrder
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

    const assigned = new Set<string>(); // track what's been assigned

    // 2. Process typed vehicles first (each handles one mulch type)
    const typedVehicles = config.vehicleAssignments.filter(a => a.mulchType);
    const hotshotVehicles = config.vehicleAssignments.filter(a => !a.mulchType);

    const typeGroups = new Map<string, typeof typedVehicles>();
    for (const tv of typedVehicles) {
        if (!typeGroups.has(tv.mulchType!)) typeGroups.set(tv.mulchType!, []);
        typeGroups.get(tv.mulchType!)!.push(tv);
    }

    for (const [mulchType, vehicles] of Array.from(typeGroups.entries())) {
        if (config.strategy === 'efficient') {
            vehicles.sort((a, b) => {
                const vA = state.vehicles[a.vehicleId];
                const vB = state.vehicles[b.vehicleId];
                const typeScore = (v: Vehicle) => v?.type === 'Truck' ? 1 : 2; // Truck first
                return typeScore(vA) - typeScore(vB);
            });
        }

        // Find stops with this mulch type that haven't been assigned yet
        const typeStops = allStops.filter(s =>
            !assigned.has(s.id) &&
            (isSpreadingMode || s.mulchOrders.some(o => o.mulchType === mulchType))
        );

        if (typeStops.length === 0) {
            summary.push(`No stops need ${isSpreadingMode ? 'spreading' : mulchType}.`);
            continue;
        }

        let remainingTypeStops = [...typeStops];
        let vehicleIdx = 0;
        const tripCounts = new Map<string, number>();

        while (remainingTypeStops.length > 0) {
            const currentVehicleAssignment = vehicles[vehicleIdx % vehicles.length];
            const vehicle = state.vehicles[currentVehicleAssignment.vehicleId];
            if (!vehicle) break;

            const chunks = geographicChunk(remainingTypeStops, vehicle.maxBagCapacity, config.depotCoords, state.stops, isSpreadingMode);
            if (chunks.length === 0) break;

            const trip = chunks[0];
            const tripCount = (tripCounts.get(vehicle.id) || 0) + 1;
            tripCounts.set(vehicle.id, tripCount);

            const routeId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            const routeName = `${vehicle.name} - ${mulchType} (Trip ${tripCount})`;

            const route: Route = {
                id: routeId,
                name: routeName,
                vehicleId: vehicle.id,
                mulchType: mulchType as MulchType,
                serviceMode: state.activeServiceMode,
                stopIds: [],
                color: nextColor(),
                visible: true,
                optimized: false,
                routeGeometry: null,
                distanceMiles: null,
                durationMinutes: null,
            };

            routes.push(route);

            // Order stops optimally within this trip
            const ordered = optimizeTripOrder(trip, config.depotCoords, state.stops);
            for (const stopId of ordered) {
                assignments.push({ stopId, routeId });
                assigned.add(stopId);
            }

            remainingTypeStops = remainingTypeStops.filter(s => !assigned.has(s.id));
            vehicleIdx++;

            summary.push(`Created: ${routeName} (${trip.length} stops)`);
        }
    }

    // 3. Collect leftover stops for hotshot vehicles
    const leftoverStops = allStops.filter(s => !assigned.has(s.id));

    if (leftoverStops.length > 0 && hotshotVehicles.length > 0) {
        if (config.strategy === 'efficient') {
            hotshotVehicles.sort((a, b) => {
                const vA = state.vehicles[a.vehicleId];
                const vB = state.vehicles[b.vehicleId];
                const typeScore = (v: Vehicle) => v?.type === 'Truck' ? 1 : 2;
                return typeScore(vA) - typeScore(vB);
            });
        }

        let remainingHotshotStops = [...leftoverStops];
        let hotshotIdx = 0;
        const tripCounts = new Map<string, number>();

        if (isSpreadingMode) {
            // Spreading: balance bags equally across all hotshot vehicles while keeping
            // geographically close stops together.
            const vehicleList = hotshotVehicles
                .map(a => state.vehicles[a.vehicleId])
                .filter(Boolean) as Vehicle[];

            const groups = spreadingBalancedSplit(remainingHotshotStops, vehicleList.length, config.depotCoords, isSpreadingMode);

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
                    serviceMode: state.activeServiceMode,
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
        } else {
            while (remainingHotshotStops.length > 0) {
                const currentAssignment = hotshotVehicles[hotshotIdx % hotshotVehicles.length];
                const vehicle = state.vehicles[currentAssignment.vehicleId];
                if (!vehicle) break;

                const effectiveCapacity = vehicle.maxBagCapacity;
                const chunks = geographicChunk(remainingHotshotStops, effectiveCapacity, config.depotCoords, state.stops, isSpreadingMode);
                if (chunks.length === 0) break;

                const trip = chunks[0];
                const tripCount = (tripCounts.get(vehicle.id) || 0) + 1;
                tripCounts.set(vehicle.id, tripCount);

                const routeId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                const route: Route = {
                    id: routeId,
                    name: `${vehicle.name} - Hotshot (Trip ${tripCount})`,
                    vehicleId: vehicle.id,
                    mulchType: null,
                    serviceMode: state.activeServiceMode,
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

                remainingHotshotStops = remainingHotshotStops.filter(s => !assigned.has(s.id));
                hotshotIdx++;

                summary.push(`Created: ${route.name} (${trip.length} stops)`);
            }
        }
    } else if (leftoverStops.length > 0 && hotshotVehicles.length === 0) {
        // No hotshot vehicle — distribute leftovers to typed vehicles with capacity
        const remainingByType: Record<string, DeliveryStop[]> = {};
        for (const stop of leftoverStops) {
            // Try to find a typed vehicle that can handle this stop's primary mulch type
            const primaryType = stop.mulchOrders[0]?.mulchType;
            if (primaryType) {
                if (!remainingByType[primaryType]) remainingByType[primaryType] = [];
                remainingByType[primaryType].push(stop);
            } else {
                if (!remainingByType['mixed']) remainingByType['mixed'] = [];
                remainingByType['mixed'].push(stop);
            }
        }

        for (const [type, stops] of Object.entries(remainingByType)) {
            // Find the typed vehicle for this mulch type, or use the first available vehicle
            const tv = typedVehicles.find(a => a.mulchType === type);
            const vehicleId = tv?.vehicleId || typedVehicles[0]?.vehicleId;
            const vehicle = vehicleId ? state.vehicles[vehicleId] : null;

            if (vehicle) {
                const trips = geographicChunk(stops, vehicle.maxBagCapacity, config.depotCoords, state.stops, isSpreadingMode);
                for (let i = 0; i < trips.length; i++) {
                    const routeId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                    const route: Route = {
                        id: routeId,
                        name: `${vehicle.name} - Overflow ${type} (Trip ${i + 1})`,
                        vehicleId: vehicle.id,
                        mulchType: type === 'mixed' ? null : type as MulchType,
                        serviceMode: state.activeServiceMode,
                        stopIds: [],
                        color: nextColor(),
                        visible: true,
                        optimized: false,
                        routeGeometry: null,
                        distanceMiles: null,
                        durationMinutes: null,
                    };
                    routes.push(route);
                    const ordered = optimizeTripOrder(trips[i], config.depotCoords, state.stops);
                    for (const stopId of ordered) {
                        assignments.push({ stopId, routeId });
                        assigned.add(stopId);
                    }
                }
            }
        }

        if (leftoverStops.some(s => !assigned.has(s.id))) {
            const unhandled = leftoverStops.filter(s => !assigned.has(s.id));
            errors.push(`${unhandled.length} stops could not be assigned — no suitable vehicle.`);
        }
    }

    const finalLeftovers = allStops.filter(s => !assigned.has(s.id));
    if (finalLeftovers.length > 0) {
        errors.push(`${finalLeftovers.length} stops remain unassigned.`);
    }

    if (routes.length === 0) {
        errors.push('Could not generate any routes with the current configuration.');
    }

    return { routes, assignments, errors, summary };
}

/**
 * Geographically cluster stops and chunk into capacity-fitted trips.
 * Uses a greedy spatial clustering approach:
 * 1. Sort all stops by distance from depot (or centroid)
 * 2. Fill trips greedily, trying to keep geographically close stops together
 * 3. When a trip is full, start a new one from the next closest unassigned stop
 */
function geographicChunk(
    stops: DeliveryStop[],
    capacity: number,
    depotCoords: [number, number] | null,
    allStops: Record<string, DeliveryStop>,
    isSpreadingMode: boolean
): DeliveryStop[][] {
    if (stops.length === 0) return [];

    // Get stops with coordinates for sorting
    const withCoords = stops.filter(s => s.coordinates);
    const noCoords = stops.filter(s => !s.coordinates);

    // Reference point: depot or centroid
    const ref: [number, number] = depotCoords || (withCoords.length > 0
        ? [
            withCoords.reduce((s, stop) => s + stop.coordinates![0], 0) / withCoords.length,
            withCoords.reduce((s, stop) => s + stop.coordinates![1], 0) / withCoords.length,
        ]
        : [0, 0]);

    // Sort by distance from reference (depot)
    withCoords.sort((a, b) => dist(ref, a.coordinates!) - dist(ref, b.coordinates!));

    // Now cluster into trips using spatial grouping
    const trips: DeliveryStop[][] = [];
    const used = new Set<string>();

    // Process all stops with coordinates
    let remaining = [...withCoords];

    while (remaining.length > 0) {
        const trip: DeliveryStop[] = [];
        let tripBags = 0;

        // Start from the closest remaining stop to depot
        const seed = remaining[0];
        trip.push(seed);
        tripBags += isSpreadingMode ? (seed.spreadingOrder?.quantity || 0) : seed.totalBags;
        used.add(seed.id);

        // Greedily add nearest neighbors that fit
        let current = seed;
        const tripRemaining = remaining.filter(s => s.id !== seed.id);

        for (const candidate of sortByDistanceFrom(current.coordinates!, tripRemaining)) {
            if (used.has(candidate.id)) continue;
            const candidateBags = isSpreadingMode ? (candidate.spreadingOrder?.quantity || 0) : candidate.totalBags;
            if (tripBags + candidateBags > capacity && trip.length > 0) {
                // Check if this single stop exceeds capacity — if so, still add it (oversized)
                if (trip.length === 0) {
                    trip.push(candidate);
                    tripBags += candidateBags;
                    used.add(candidate.id);
                }
                continue;
            }
            trip.push(candidate);
            tripBags += candidateBags;
            used.add(candidate.id);
            current = candidate;
        }

        trips.push(trip);
        remaining = remaining.filter(s => !used.has(s.id));
    }

    // Add non-geocoded stops to the last trip or create a new one
    if (noCoords.length > 0) {
        let currentTrip = trips[trips.length - 1] || [];
        let tripBags = currentTrip.reduce((s, stop) => s + (isSpreadingMode ? (stop.spreadingOrder?.quantity || 0) : stop.totalBags), 0);

        for (const stop of noCoords) {
            const stopBags = isSpreadingMode ? (stop.spreadingOrder?.quantity || 0) : stop.totalBags;
            if (tripBags + stopBags > capacity && currentTrip.length > 0) {
                currentTrip = [];
                trips.push(currentTrip);
                tripBags = 0;
            }
            currentTrip.push(stop);
            tripBags += stopBags;
        }

        if (currentTrip.length > 0 && !trips.includes(currentTrip)) {
            trips.push(currentTrip);
        }
    }

    return trips;
}

/**
 * Spreading-specific balanced split.
 *
 * Priority: equal bag totals per vehicle, with geographic cohesion as a tiebreaker.
 *
 * Algorithm:
 * 1. Sort all stops by distance from depot → creates a spatial ordering.
 * 2. Assign each stop to whichever bucket currently has the fewest bags
 *    (min-heap / linear scan). Ties broken by closest geographic centroid of
 *    the candidate bucket.
 * 3. Non-geocoded stops appended last to the least-loaded bucket.
 */
function spreadingBalancedSplit(
    stops: DeliveryStop[],
    numBuckets: number,
    depotCoords: [number, number] | null,
    isSpreadingMode: boolean
): DeliveryStop[][] {
    if (numBuckets <= 0 || stops.length === 0) return [stops];

    const withCoords = stops.filter(s => s.coordinates);
    const noCoords = stops.filter(s => !s.coordinates);

    // 1. Sort geographically by distance from depot
    const ref: [number, number] = depotCoords || (withCoords.length > 0
        ? [
            withCoords.reduce((s, stop) => s + stop.coordinates![0], 0) / withCoords.length,
            withCoords.reduce((s, stop) => s + stop.coordinates![1], 0) / withCoords.length,
        ]
        : [0, 0]);
    const sorted = [...withCoords].sort((a, b) => dist(ref, a.coordinates!) - dist(ref, b.coordinates!));

    // 2. Initialize buckets
    const buckets: DeliveryStop[][] = Array.from({ length: numBuckets }, () => []);
    const bucketBags: number[] = new Array(numBuckets).fill(0);

    const getBags = (s: DeliveryStop) => isSpreadingMode ? (s.spreadingOrder?.quantity || 0) : s.totalBags;

    // Compute centroid of a bucket (or ref if empty)
    const centroid = (bucket: DeliveryStop[]): [number, number] => {
        const withC = bucket.filter(s => s.coordinates);
        if (withC.length === 0) return ref;
        return [
            withC.reduce((sum, s) => sum + s.coordinates![0], 0) / withC.length,
            withC.reduce((sum, s) => sum + s.coordinates![1], 0) / withC.length,
        ];
    };

    for (const stop of sorted) {
        const bags = getBags(stop);
        const stopCoord = stop.coordinates!;

        // Find bucket with minimum bags; use geographic closeness as tiebreaker
        let bestIdx = 0;
        let bestBags = bucketBags[0];
        let bestDistToCentroid = dist(stopCoord, centroid(buckets[0]));

        for (let i = 1; i < numBuckets; i++) {
            const bBags = bucketBags[i];
            const bDist = dist(stopCoord, centroid(buckets[i]));

            // Primary: fewer bags wins. Within a 15% tolerance, prefer the closer centroid.
            const tolerance = (bestBags + bBags) * 0.15;
            const bagDiff = bBags - bestBags;
            if (bagDiff < -tolerance || (Math.abs(bagDiff) <= tolerance && bDist < bestDistToCentroid)) {
                bestIdx = i;
                bestBags = bBags;
                bestDistToCentroid = bDist;
            }
        }

        buckets[bestIdx].push(stop);
        bucketBags[bestIdx] += bags;
    }

    // 3. Append non-geocoded stops to the buckets with the fewest bags
    for (const stop of noCoords) {
        const bags = getBags(stop);
        const minIdx = bucketBags.indexOf(Math.min(...bucketBags));
        buckets[minIdx].push(stop);
        bucketBags[minIdx] += bags;
    }

    return buckets.filter(b => b.length > 0);
}

/** Sort stops by distance from a point */
function sortByDistanceFrom(from: [number, number], stops: DeliveryStop[]): DeliveryStop[] {
    return [...stops]
        .filter(s => s.coordinates)
        .sort((a, b) => dist(from, a.coordinates!) - dist(from, b.coordinates!));
}

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
