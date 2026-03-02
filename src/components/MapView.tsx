'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { useTheme } from 'next-themes';
import { useAppState, useAppDispatch } from '@/src/lib/store';
import type { DeliveryStop, MulchType } from '@/src/lib/types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
mapboxgl.accessToken = MAPBOX_TOKEN;

const MULCH_COLORS: Record<string, string> = {
    black: '#1f2937',
    'aromatic cedar': '#d97706',
    'fine shredded hardwood': '#92400e',
};

const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11';
const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';

interface MapViewProps {
    onStopClick: (stop: DeliveryStop) => void;
    onStopDetail: (stop: DeliveryStop) => void;
}

export function MapView({ onStopClick, onStopDetail }: MapViewProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
    const popupRef = useRef<mapboxgl.Popup | null>(null);
    const overlayMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
    const routeSourcesRef = useRef<Set<string>>(new Set());
    const depotMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const { resolvedTheme } = useTheme();
    const state = useAppState();
    const dispatch = useAppDispatch();

    // Get filtered stops
    const visibleStops = useMemo(() => {
        let stops = state.stopOrder.map((id) => state.stops[id]).filter((s) => s?.coordinates);
        const { filters } = state;

        if (!filters.showDisabled) {
            stops = stops.filter((s) => !s.isDisabled);
        }
        if (filters.mulchTypes.length > 0) {
            stops = stops.filter((s) =>
                s.mulchOrders.some((o) => filters.mulchTypes.includes(o.mulchType))
            );
        }
        if (filters.showHotshotsOnly) {
            stops = stops.filter((s) => s.isHotshot);
        }
        if (filters.vehicleId) {
            const route = Object.values(state.routes).find((r) => r.vehicleId === filters.vehicleId);
            if (route) {
                const routeStopIds = new Set(route.stopIds);
                stops = stops.filter((s) => routeStopIds.has(s.id) || !s.routeId);
            }
        }
        const invisibleRouteIds = new Set(
            Object.values(state.routes).filter((r) => !r.visible).map((r) => r.id)
        );
        stops = stops.filter((s) => !s.routeId || !invisibleRouteIds.has(s.routeId!));
        return stops;
    }, [state]);

    const visibleRoutes = useMemo(() => {
        return Object.values(state.routes).filter((r) => r.visible);
    }, [state.routes]);

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || mapRef.current) return;
        const map = new mapboxgl.Map({
            container: mapContainer.current,
            style: resolvedTheme === 'dark' ? DARK_STYLE : LIGHT_STYLE,
            center: [-96.77, 33.02],
            zoom: 11,
        });
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
        mapRef.current = map;
        return () => { map.remove(); mapRef.current = null; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Update map style
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        map.setStyle(resolvedTheme === 'dark' ? DARK_STYLE : LIGHT_STYLE);
    }, [resolvedTheme]);

    // Create marker element
    const createMarkerEl = useCallback(
        (stop: DeliveryStop) => {
            const el = document.createElement('div');
            el.className = 'map-marker';
            const primaryMulch = stop.mulchOrders[0];
            const color = primaryMulch ? MULCH_COLORS[primaryMulch.mulchType.toLowerCase()] || '#6b7280' : '#6b7280';
            const route = stop.routeId ? state.routes[stop.routeId] : null;
            const routeColor = route?.color;
            const isDisabled = stop.isDisabled;
            const markerColor = isDisabled ? '#9ca3af' : (routeColor || color);
            const opacity = isDisabled ? '0.45' : '1';

            el.innerHTML = `
        <div class="marker-pin" style="background-color: ${markerColor}; opacity: ${opacity}">
          <span class="marker-count">${stop.totalBags}</span>
        </div>
        ${stop.isHotshot && !isDisabled ? '<div class="marker-hotshot">🔥</div>' : ''}
      `;
            return el;
        },
        [state.routes]
    );

    // Update markers
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const currentIds = new Set(visibleStops.map((s) => s.id));

        for (const [id, marker] of markersRef.current) {
            if (!currentIds.has(id)) { marker.remove(); markersRef.current.delete(id); }
        }

        for (const stop of visibleStops) {
            if (!stop.coordinates) continue;
            if (markersRef.current.has(stop.id)) {
                markersRef.current.get(stop.id)!.remove();
            }

            const el = createMarkerEl(stop);

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                dispatch({ type: 'SELECT_STOP', payload: stop.id });
                onStopClick(stop);

                const selectedRoute = state.selectedRouteId ? state.routes[state.selectedRouteId] : null;
                const currentRoute = stop.routeId ? state.routes[stop.routeId] : null;
                const isDisabled = stop.isDisabled;

                let assignBtn = '';
                if (selectedRoute && !isDisabled && stop.routeId !== selectedRoute.id) {
                    assignBtn = `<button class="popup-assign-btn" id="popup-assign-${stop.id}" style="background:${selectedRoute.color}">
                        ➕ Add to ${selectedRoute.name}
                    </button>`;
                } else if (currentRoute) {
                    assignBtn = `<span class="popup-route-tag" style="color:${currentRoute.color}">🏷️ In: ${currentRoute.name}</span>`;
                }

                if (popupRef.current) popupRef.current.remove();
                const popup = new mapboxgl.Popup({ offset: 25, closeButton: true, maxWidth: '320px' })
                    .setLngLat(stop.coordinates!)
                    .setHTML(`
            <div class="map-popup">
              <h3 class="popup-name">${stop.recipientName}</h3>
              <p class="popup-address">${stop.fullAddress}</p>
              <div class="popup-meta">
                ${stop.mulchOrders
                            .map((o) => `<span class="popup-badge mulch-${o.mulchType.toLowerCase().replace(/\s+/g, '-')}">${o.quantity}× ${o.mulchType}</span>`)
                            .join('')}
              </div>
              ${stop.fulfillmentNotes ? `<p class="popup-notes">${stop.fulfillmentNotes}</p>` : ''}
              ${assignBtn}
              <button class="popup-detail-btn" id="popup-detail-${stop.id}">View Full Order</button>
            </div>
          `)
                    .addTo(map);

                popupRef.current = popup;

                setTimeout(() => {
                    const detailBtn = document.getElementById(`popup-detail-${stop.id}`);
                    if (detailBtn) {
                        detailBtn.addEventListener('click', () => { onStopDetail(stop); popup.remove(); });
                    }
                    const assignBtnEl = document.getElementById(`popup-assign-${stop.id}`);
                    if (assignBtnEl && selectedRoute) {
                        assignBtnEl.addEventListener('click', () => {
                            dispatch({ type: 'ASSIGN_STOP_TO_ROUTE', payload: { stopId: stop.id, routeId: selectedRoute.id } });
                            popup.remove();
                        });
                    }
                }, 100);
            });

            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat(stop.coordinates!)
                .addTo(map);
            markersRef.current.set(stop.id, marker);
        }
    }, [visibleStops, createMarkerEl, dispatch, state.selectedRouteId, onStopClick, onStopDetail]);

    // Overlay labels
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        for (const [, marker] of overlayMarkersRef.current) marker.remove();
        overlayMarkersRef.current.clear();

        if (!state.overlays.showScoutName && !state.overlays.showBagCount && !state.overlays.showSpecialInstructions) return;

        for (const stop of visibleStops) {
            if (!stop.coordinates) continue;
            const parts: string[] = [];
            if (state.overlays.showBagCount) parts.push(`${stop.totalBags} bags`);
            if (state.overlays.showScoutName) parts.push(stop.mulchOrders[0]?.scoutName || 'Unknown');
            if (state.overlays.showSpecialInstructions && stop.fulfillmentNotes) {
                parts.push(stop.fulfillmentNotes.length > 40 ? stop.fulfillmentNotes.substring(0, 40) + '...' : stop.fulfillmentNotes);
            }
            if (parts.length === 0) continue;

            const el = document.createElement('div');
            el.className = 'map-overlay-label';
            el.textContent = parts.join(' • ');

            const marker = new mapboxgl.Marker({ element: el, offset: [0, -45] })
                .setLngLat(stop.coordinates!)
                .addTo(map);
            overlayMarkersRef.current.set(stop.id, marker);
        }
    }, [visibleStops, state.overlays]);

    // Depot marker
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        if (depotMarkerRef.current) {
            depotMarkerRef.current.remove();
            depotMarkerRef.current = null;
        }

        const depotCoords = state.settings.depotCoords;
        if (!depotCoords || !state.settings.depotAddress) return;

        const depotEl = document.createElement('div');
        depotEl.className = 'depot-marker';
        depotEl.innerHTML = `<div class="depot-pin">🏠</div><div class="depot-label">Depot</div>`;

        const marker = new mapboxgl.Marker({ element: depotEl })
            .setLngLat(depotCoords)
            .addTo(map);
        depotMarkerRef.current = marker;

        return () => {
            if (depotMarkerRef.current) {
                depotMarkerRef.current.remove();
                depotMarkerRef.current = null;
            }
        };
    }, [state.settings]);

    // Update route lines
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;

        const depotCoords = state.settings.depotCoords;

        const handleStyleLoad = () => {
            for (const sourceId of routeSourcesRef.current) {
                if (map.getLayer(`${sourceId}-layer`)) map.removeLayer(`${sourceId}-layer`);
                if (map.getSource(sourceId)) map.removeSource(sourceId);
            }
            routeSourcesRef.current.clear();

            for (const route of visibleRoutes) {
                if (route.routeGeometry) {
                    const sourceId = `route-${route.id}`;
                    map.addSource(sourceId, {
                        type: 'geojson',
                        data: { type: 'Feature', properties: {}, geometry: route.routeGeometry },
                    });
                    map.addLayer({
                        id: `${sourceId}-layer`,
                        type: 'line',
                        source: sourceId,
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: { 'line-color': route.color, 'line-width': 4, 'line-opacity': 0.8 },
                    });
                    routeSourcesRef.current.add(sourceId);
                } else if (route.stopIds.length >= 2) {
                    const stopCoords = route.stopIds
                        .map(id => state.stops[id]?.coordinates)
                        .filter(Boolean) as [number, number][];

                    // Depot as start/end
                    const coords: [number, number][] = [];
                    if (depotCoords) coords.push(depotCoords);
                    coords.push(...stopCoords);
                    if (depotCoords) coords.push(depotCoords);

                    if (coords.length >= 2) {
                        const sourceId = `route-${route.id}`;
                        map.addSource(sourceId, {
                            type: 'geojson',
                            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
                        });
                        map.addLayer({
                            id: `${sourceId}-layer`,
                            type: 'line',
                            source: sourceId,
                            layout: { 'line-join': 'round', 'line-cap': 'round' },
                            paint: { 'line-color': route.color, 'line-width': 3, 'line-opacity': 0.6, 'line-dasharray': [2, 2] },
                        });
                        routeSourcesRef.current.add(sourceId);
                    }
                }
            }
        };

        if (map.isStyleLoaded()) handleStyleLoad();
        map.on('style.load', handleStyleLoad);
        return () => { map.off('style.load', handleStyleLoad); };
    }, [visibleRoutes, state.stops, state.settings]);

    // Fit bounds
    useEffect(() => {
        const map = mapRef.current;
        if (!map || visibleStops.length === 0) return;

        const bounds = new mapboxgl.LngLatBounds();
        for (const stop of visibleStops) {
            if (stop.coordinates) bounds.extend(stop.coordinates);
        }
        if (state.settings.depotCoords) bounds.extend(state.settings.depotCoords);

        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
        }
    }, [visibleStops.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Highlight selected stop
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        for (const [id, marker] of markersRef.current) {
            marker.getElement().classList.toggle('marker-selected', id === state.selectedStopId);
        }
        if (state.selectedStopId) {
            const stop = state.stops[state.selectedStopId];
            if (stop?.coordinates) map.flyTo({ center: stop.coordinates, zoom: 15, duration: 800 });
        }
    }, [state.selectedStopId, state.stops]);

    return (
        <div className="map-container">
            <div ref={mapContainer} className="map-gl" />
            {state.isManualRouteMode && (
                <div className="map-mode-indicator">
                    <span>📍 Manual Route Mode — Click markers to add to route</span>
                    <button onClick={() => dispatch({ type: 'CLEAR_MANUAL_ROUTE' })} className="btn btn-xs btn-outline">Exit</button>
                </div>
            )}
        </div>
    );
}
