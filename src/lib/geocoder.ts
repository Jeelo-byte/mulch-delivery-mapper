const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

interface GeocodingResult {
    coordinates: [number, number]; // [lng, lat]
    relevance: number;
}

const geocodeCache = new Map<string, [number, number]>();

/**
 * Geocode a single address using the Mapbox Geocoding API.
 */
export async function geocodeAddress(address: string): Promise<[number, number] | null> {
    const cacheKey = address.toLowerCase().trim();
    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey)!;
    }

    try {
        const encoded = encodeURIComponent(address);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&country=US&types=address&limit=1`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Geocoding failed for "${address}": ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data.features && data.features.length > 0) {
            const [lng, lat] = data.features[0].center as [number, number];
            geocodeCache.set(cacheKey, [lng, lat]);
            return [lng, lat];
        }

        return null;
    } catch (error) {
        console.error(`Geocoding error for "${address}":`, error);
        return null;
    }
}

/**
 * Batch geocode an array of addresses with rate limiting.
 * Returns a Map of address → coordinates.
 */
export async function batchGeocode(
    addresses: { id: string; address: string }[],
    onProgress?: (completed: number, total: number) => void
): Promise<Map<string, [number, number]>> {
    const results = new Map<string, [number, number]>();
    const total = addresses.length;

    // Process in batches of 5 to respect rate limits
    const BATCH_SIZE = 5;
    const DELAY_MS = 200;

    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        const batch = addresses.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async ({ id, address }) => {
            const coords = await geocodeAddress(address);
            if (coords) {
                results.set(id, coords);
            }
            return { id, coords };
        });

        await Promise.all(promises);
        onProgress?.(Math.min(i + BATCH_SIZE, total), total);

        // Rate limit delay between batches
        if (i + BATCH_SIZE < addresses.length) {
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        }
    }

    return results;
}
