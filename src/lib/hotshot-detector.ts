import * as turf from '@turf/turf';
import type { DeliveryStop } from './types';

/**
 * Detect "hotshot" outliers — addresses significantly far from the main cluster.
 * Uses DBSCAN clustering from turf.js.
 *
 * @param stops - Array of delivery stops with coordinates
 * @param maxDistanceKm - Maximum distance (km) between points in a cluster (default: 8km ~5mi)
 * @param minPoints - Minimum points to form a cluster (default: 3)
 * @returns Set of stop IDs that are outliers
 */
export function detectHotshots(
    stops: DeliveryStop[],
    maxDistanceKm: number = 8,
    minPoints: number = 3
): Set<string> {
    const stopsWithCoords = stops.filter((s) => s.coordinates !== null);
    if (stopsWithCoords.length < minPoints) return new Set();

    // Create GeoJSON FeatureCollection of points
    const points = turf.featureCollection(
        stopsWithCoords.map((stop) =>
            turf.point(stop.coordinates!, { stopId: stop.id })
        )
    );

    // Run DBSCAN clustering
    const clustered = turf.clustersDbscan(points, maxDistanceKm, {
        minPoints,
        units: 'kilometers',
    });

    // Find the largest cluster (main cluster)
    const clusterCounts = new Map<number, number>();
    clustered.features.forEach((f) => {
        const cluster = f.properties?.cluster;
        if (cluster !== undefined && cluster >= 0) {
            clusterCounts.set(cluster, (clusterCounts.get(cluster) || 0) + 1);
        }
    });

    // Determine main cluster (largest)
    let mainCluster = -1;
    let maxCount = 0;
    for (const [clusterId, count] of clusterCounts) {
        if (count > maxCount) {
            maxCount = count;
            mainCluster = clusterId;
        }
    }

    // Flag outliers: points not in the main cluster (noise or small clusters)
    const hotshots = new Set<string>();
    clustered.features.forEach((f) => {
        const cluster = f.properties?.cluster;
        const stopId = f.properties?.stopId;
        if (stopId && (cluster === undefined || cluster < 0 || cluster !== mainCluster)) {
            hotshots.add(stopId);
        }
    });

    return hotshots;
}
