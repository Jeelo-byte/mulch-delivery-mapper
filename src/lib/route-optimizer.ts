import type { DeliveryStop, OptimizationMode } from './types';
import { featureCollection, point, clustersKmeans, centerOfMass } from '@turf/turf';

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
    mode: OptimizationMode = 'distance',
    depotCoords?: [number, number] | null
): Promise<{ orderedIds: string[]; geometry: GeoJSON.LineString | null }> {
    const stopsWithCoords = stops.filter((s) => s.coordinates);

    if (stopsWithCoords.length <= 1) {
        return { orderedIds: stopsWithCoords.map((s) => s.id), geometry: null };
    }

    // Mapbox Optimization API supports max 12 coordinates
    if (stopsWithCoords.length > 12) {
        const numClusters = Math.ceil(stopsWithCoords.length / 10);
        const points = featureCollection(stopsWithCoords.map(s => point(s.coordinates as [number, number], { id: s.id })));

        // Turf.js clustering workaround
        const clustered = clustersKmeans(points, { numberOfClusters: numClusters });
        const clusterMap = new Map<number, typeof stopsWithCoords>();

        clustered.features.forEach(f => {
            const cluster = f.properties.cluster;
            if (cluster === undefined) return;
            if (!clusterMap.has(cluster)) clusterMap.set(cluster, []);
            const stop = stopsWithCoords.find(s => s.id === f.properties.id);
            if (stop) clusterMap.get(cluster)!.push(stop);
        });

        const clusters = Array.from(clusterMap.values());

        const clusterCentroids = clusters.map(c => {
            const pts = featureCollection(c.map(s => point(s.coordinates as [number, number])));
            const center = centerOfMass(pts);
            return center.geometry.coordinates as [number, number];
        });

        const tempStops = clusterCentroids.map((cCoords, i) => ({ id: i.toString(), coordinates: cCoords } as DeliveryStop));
        const orderedClusterIndices = nearestNeighborSort(tempStops).map(Number);

        const allOrderedIds: string[] = [];

        // Execute sequentially to preserve cluster order, but optimization inside clusters is parallelized conceptually
        // Wait, for deterministic behavior, let's execute sequentially
        for (const idx of orderedClusterIndices) {
            const clusterStops = clusters[idx];
            if (clusterStops.length > 12) {
                allOrderedIds.push(...nearestNeighborSort(clusterStops));
            } else {
                const res = await callOptimizationApi(clusterStops, mode, depotCoords);
                allOrderedIds.push(...res.orderedIds);
            }
        }

        const stitchedGeometry = await stitchGeometries(allOrderedIds.map(id => stopsWithCoords.find(s => s.id === id)!));
        return { orderedIds: allOrderedIds, geometry: stitchedGeometry };
    }

    return await callOptimizationApi(stopsWithCoords, mode, depotCoords);
}

async function callOptimizationApi(
    stops: DeliveryStop[],
    mode: OptimizationMode,
    depotCoords?: [number, number] | null
): Promise<{ orderedIds: string[]; geometry: GeoJSON.LineString | null }> {
    try {
        const profile = mode === 'duration' ? 'mapbox/driving-traffic' : 'mapbox/driving';

        const coordsArr: string[] = [];
        if (depotCoords) {
            coordsArr.push(`${depotCoords[0]},${depotCoords[1]}`);
        }
        stops.forEach((s) => coordsArr.push(`${s.coordinates![0]},${s.coordinates![1]}`));

        const coordinates = coordsArr.join(';');

        const url = `https://api.mapbox.com/optimized-trips/v1/${profile}/${coordinates}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full&roundtrip=false&source=first`;

        const response = await fetch(url);
        if (!response.ok) {
            console.error('Optimization API error:', response.status);
            return { orderedIds: nearestNeighborSort(stops, depotCoords || undefined), geometry: null };
        }

        const data = await response.json();
        if (data.trips && data.trips.length > 0) {
            const trip = data.trips[0];
            const waypoints = data.waypoints as Array<{ waypoint_index: number; trips_index: number }>;

            const reordered: string[] = [];
            const sortedWaypoints = [...waypoints].sort((a, b) => a.trips_index - b.trips_index);

            for (const wp of sortedWaypoints) {
                if (depotCoords && wp.waypoint_index === 0) continue;
                const originalStopIdx = depotCoords ? wp.waypoint_index - 1 : wp.waypoint_index;
                if (originalStopIdx >= 0 && originalStopIdx < stops.length) {
                    reordered.push(stops[originalStopIdx].id);
                }
            }

            return {
                orderedIds: reordered,
                geometry: trip.geometry as GeoJSON.LineString,
            };
        }

        return { orderedIds: nearestNeighborSort(stops, depotCoords || undefined), geometry: null };
    } catch (error) {
        console.error('Optimization error:', error);
        return { orderedIds: nearestNeighborSort(stops, depotCoords || undefined), geometry: null };
    }
}

async function stitchGeometries(orderedStops: DeliveryStop[]): Promise<GeoJSON.LineString | null> {
    const coords: [number, number][] = [];
    const chunkSize = 24;
    for (let i = 0; i < orderedStops.length; i += chunkSize) {
        const chunk = orderedStops.slice(i, i + chunkSize + 1);
        if (chunk.length < 2) continue;
        const geom = await getRouteDirections(chunk);
        if (geom) {
            if (coords.length > 0) {
                coords.push(...(geom.coordinates.slice(1) as [number, number][]));
            } else {
                coords.push(...(geom.coordinates as [number, number][]));
            }
        }
    }
    return coords.length > 0 ? { type: 'LineString', coordinates: coords } : null;
}

/**
 * Get driving directions (route line) between stops using Mapbox Directions API.
 */
export async function getRouteDirections(
    stops: DeliveryStop[],
    depotCoords?: [number, number] | null
): Promise<GeoJSON.LineString | null> {
    const stopsWithCoords = stops.filter((s) => s.coordinates);

    const coordsArr: string[] = [];
    if (depotCoords) coordsArr.push(`${depotCoords[0]},${depotCoords[1]}`);
    stopsWithCoords.slice(0, 24).forEach((s) => coordsArr.push(`${s.coordinates![0]},${s.coordinates![1]}`));

    if (coordsArr.length < 2) return null;

    const coords = coordsArr.join(';');

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
