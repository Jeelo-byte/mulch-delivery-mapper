import type { DeliveryStop, OptimizationMode } from './types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

/**
 * Nearest-neighbor heuristic for quick local route ordering.
 * Returns the stop IDs in optimized order.
 */
export function nearestNeighborSort(
    stops: DeliveryStop[],
    startCoords?: [number, number]
): string[] {
    if (stops.length <= 1) return stops.map((s) => s.id);

    const remaining = [...stops];
    const sorted: DeliveryStop[] = [];

    // Start from the stop nearest to startCoords, or the first stop
    let current: DeliveryStop;
    if (startCoords) {
        remaining.sort((a, b) => {
            const da = distance(startCoords, a.coordinates!);
            const db = distance(startCoords, b.coordinates!);
            return da - db;
        });
        current = remaining.shift()!;
    } else {
        current = remaining.shift()!;
    }
    sorted.push(current);

    while (remaining.length > 0) {
        let nearest = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const d = distance(current.coordinates!, remaining[i].coordinates!);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = i;
            }
        }
        current = remaining.splice(nearest, 1)[0];
        sorted.push(current);
    }

    return sorted.map((s) => s.id);
}

/** Haversine distance in km */
function distance(a: [number, number], b: [number, number]): number {
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

/**
 * Optimize route using Mapbox Optimization API.
 * Supports up to 12 coordinates per request.
 * Falls back to nearest-neighbor for more stops.
 */
export async function optimizeRoute(
    stops: DeliveryStop[],
    mode: OptimizationMode = 'distance'
): Promise<{ orderedIds: string[]; geometry: GeoJSON.LineString | null }> {
    const stopsWithCoords = stops.filter((s) => s.coordinates);

    if (stopsWithCoords.length <= 1) {
        return { orderedIds: stopsWithCoords.map((s) => s.id), geometry: null };
    }

    // Mapbox Optimization API supports max 12 coordinates
    if (stopsWithCoords.length > 12) {
        const orderedIds = nearestNeighborSort(stopsWithCoords);
        return { orderedIds, geometry: null };
    }

    try {
        const profile = mode === 'duration' ? 'mapbox/driving-traffic' : 'mapbox/driving';
        const coordinates = stopsWithCoords
            .map((s) => `${s.coordinates![0]},${s.coordinates![1]}`)
            .join(';');

        const url = `https://api.mapbox.com/optimized-trips/v1/${profile}/${coordinates}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full&roundtrip=false&source=first`;

        const response = await fetch(url);
        if (!response.ok) {
            console.error('Optimization API error:', response.status);
            const orderedIds = nearestNeighborSort(stopsWithCoords);
            return { orderedIds, geometry: null };
        }

        const data = await response.json();
        if (data.trips && data.trips.length > 0) {
            const trip = data.trips[0];
            const waypoints = data.waypoints as Array<{ waypoint_index: number; trips_index: number }>;

            // Map waypoint order back to stop IDs
            const orderedIds = waypoints
                .sort((a, b) => a.waypoint_index - b.waypoint_index)
                .map((wp, idx) => stopsWithCoords[idx].id);

            // Actually we need to reorder based on waypoint_index
            const reordered: string[] = new Array(stopsWithCoords.length);
            waypoints.forEach((wp, originalIdx) => {
                reordered[wp.waypoint_index] = stopsWithCoords[originalIdx].id;
            });

            return {
                orderedIds: reordered.filter(Boolean),
                geometry: trip.geometry as GeoJSON.LineString,
            };
        }

        const orderedIds = nearestNeighborSort(stopsWithCoords);
        return { orderedIds, geometry: null };
    } catch (error) {
        console.error('Optimization error:', error);
        const orderedIds = nearestNeighborSort(stopsWithCoords);
        return { orderedIds, geometry: null };
    }
}

/**
 * Get driving directions (route line) between stops using Mapbox Directions API.
 */
export async function getRouteDirections(
    stops: DeliveryStop[]
): Promise<GeoJSON.LineString | null> {
    const stopsWithCoords = stops.filter((s) => s.coordinates);
    if (stopsWithCoords.length < 2) return null;

    // Directions API supports max 25 coordinates
    const coords = stopsWithCoords
        .slice(0, 25)
        .map((s) => `${s.coordinates![0]},${s.coordinates![1]}`)
        .join(';');

    try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            return data.routes[0].geometry as GeoJSON.LineString;
        }
        return null;
    } catch {
        return null;
    }
}
