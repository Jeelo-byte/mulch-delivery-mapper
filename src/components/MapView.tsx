'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { useTheme } from 'next-themes';
import { useAppState, useAppDispatch } from '@/src/lib/store';
import type { DeliveryStop, MulchType } from '@/src/lib/types';
import { getMulchColor } from '@/src/lib/color-utils';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
mapboxgl.accessToken = MAPBOX_TOKEN;


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
        // Mode filter
        if (state.activeServiceMode === 'mulch') {
            stops = stops.filter(s => s.mulchOrders && s.mulchOrders.length > 0);
        } else if (state.activeServiceMode === 'spreading') {
            stops = stops.filter(s => s.spreadingOrder);
        }

        const invisibleRouteIds = new Set(
            Object.values(state.routes).filter((r) => !r.visible).map((r) => r.id)
        );
        stops = stops.filter((s) => !s.routeId || !invisibleRouteIds.has(s.routeId!));

        return stops;
    }, [state]);

    const visibleRoutes = useMemo(() => {
        return Object.values(state.routes).filter((r) => r.visible && r.serviceMode === state.activeServiceMode);
    }, [state.routes, state.activeServiceMode]);

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

        const resizeObserver = new ResizeObserver(() => {
            if (mapRef.current) {
                mapRef.current.resize();
            }
        });
        resizeObserver.observe(mapContainer.current);

        return () => {
            resizeObserver.disconnect();
            map.remove();
            mapRef.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Update map style
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        map.setStyle(resolvedTheme === 'dark' ? DARK_STYLE : LIGHT_STYLE);
    }, [resolvedTheme]);

    // Create marker element
    const createMarkerEl = useCallback(
        (stop: DeliveryStop, routeIndex: number | null, isDimmed: boolean) => {
            const el = document.createElement('div');
            el.className = 'map-marker';
            const primaryMulch = stop.mulchOrders[0];
            let color = '#6b7280';
            if (primaryMulch) {
                color = getMulchColor(primaryMulch.mulchType);
            } else if (stop.spreadingOrder) {
                color = '#6366f1';
            }

            const currentRouteId = state.activeServiceMode === 'spreading' ? stop.spreadingRouteId : stop.routeId;
            const route = currentRouteId ? state.routes[currentRouteId] : null;
            const routeColor = route?.color;
            const isDisabled = stop.isDisabled;
            const markerColor = isDisabled ? '#9ca3af' : (routeColor || color);
            const opacity = isDisabled || isDimmed ? '0.35' : '1';

            const badgeContent = routeIndex !== null ? routeIndex : stop.totalBags;

            el.innerHTML = `
        <div class="marker-pin" style="background-color: ${markerColor}; opacity: ${opacity}; --pin-scale: ${(state.settings.mapPinScale || 1.0) * (isDimmed ? 0.85 : 1)};">
          <span class="marker-count">${badgeContent}</span>
        </div>
        ${stop.isHotshot && !isDisabled ? '<div class="marker-hotshot">🔥</div>' : ''}
      `;
            return el;
        },
        [state.routes, state.activeServiceMode, state.settings.mapPinScale]
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

            const currentRouteId = state.activeServiceMode === 'spreading' ? stop.spreadingRouteId : stop.routeId;
            let routeIndex: number | null = null;
            if (currentRouteId && state.routes[currentRouteId]) {
                const idx = state.routes[currentRouteId].stopIds.indexOf(stop.id);
                if (idx !== -1) routeIndex = idx + 1;
            }

            const isDimmed = state.selectedRouteId !== null && currentRouteId !== state.selectedRouteId;
            const el = createMarkerEl(stop, routeIndex, isDimmed);

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                dispatch({ type: 'SELECT_STOP', payload: stop.id });
                onStopClick(stop);

                const selectedRoute = state.selectedRouteId ? state.routes[state.selectedRouteId] : null;
                const currentRouteObj = currentRouteId ? state.routes[currentRouteId] : null;
                const isDisabled = stop.isDisabled;

                let assignBtn = '';
                if (selectedRoute && !isDisabled && currentRouteId !== selectedRoute.id) {
                    assignBtn = `<button class="popup-assign-btn" id="popup-assign-${stop.id}" style="background:${selectedRoute.color}">
                        ➕ Add to ${selectedRoute.name}
                    </button>`;
                } else if (currentRouteObj) {
                    assignBtn = `<span class="popup-route-tag" style="color:${currentRouteObj.color}">🏷️ In: ${currentRouteObj.name}</span>`;
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
    }, [visibleStops, createMarkerEl, dispatch, state.selectedRouteId, onStopClick, onStopDetail, state.routes, state.activeServiceMode, state.settings.mapPinScale]);

    // Overlay labels — only for Scout and Notes (bag count is shown inside the pin bubble)
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        for (const [, marker] of overlayMarkersRef.current) marker.remove();
        overlayMarkersRef.current.clear();

        // Only create text labels for Scout and Notes overlays (not for bag count)
        if (!state.overlays.showScoutName && !state.overlays.showSpecialInstructions) return;

        for (const stop of visibleStops) {
            if (!stop.coordinates) continue;
            const parts: string[] = [];
            // Bag count is intentionally excluded here — it shows inside the pin bubble
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
        if (!map) return;

        const depotCoords = state.settings.depotCoords;

        const handleStyleLoad = () => {
            if (!map.isStyleLoaded()) return;

            for (const sourceId of routeSourcesRef.current) {
                if (map.getLayer(`${sourceId}-layer`)) map.removeLayer(`${sourceId}-layer`);
                if (map.getSource(sourceId)) map.removeSource(sourceId);
            }
            routeSourcesRef.current.clear();

            for (const route of visibleRoutes) {
                const isSelected = state.selectedRouteId === route.id;
                const isDimmed = state.selectedRouteId !== null && !isSelected;
                const opacity = isDimmed ? 0.2 : 0.8;
                const baseWidth = state.settings.mapLineThickness || 4;
                const selectedWidth = state.settings.mapSelectedLineThickness || 6;
                const width = isSelected ? selectedWidth : baseWidth;

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
                        paint: { 'line-color': route.color, 'line-width': width, 'line-opacity': opacity },
                    });
                    routeSourcesRef.current.add(sourceId);

                    if (route.legStats && route.legStats.length > 0) {
                        const labelFeatures: GeoJSON.Feature<GeoJSON.LineString, { description: string }>[] = [];
                        for (const leg of route.legStats) {
                            if (leg.geometry) {
                                labelFeatures.push({
                                    type: 'Feature',
                                    properties: {
                                        description: `${Math.round(leg.durationMinutes)} min (${leg.distanceMiles.toFixed(1)} mi)`
                                    },
                                    geometry: leg.geometry
                                });
                            }
                        }
                        if (labelFeatures.length > 0) {
                            const labelSourceId = `${sourceId}-labels`;
                            map.addSource(labelSourceId, {
                                type: 'geojson',
                                data: { type: 'FeatureCollection', features: labelFeatures }
                            });
                            map.addLayer({
                                id: `${labelSourceId}-layer`,
                                type: 'symbol',
                                source: labelSourceId,
                                layout: {
                                    'symbol-placement': 'line',
                                    'text-field': ['get', 'description'],
                                    'text-size': state.settings.mapLabelTextSize || 12,
                                    'text-max-angle': 30,
                                    'text-pitch-alignment': 'viewport',
                                    'symbol-spacing': 250,
                                    'text-keep-upright': true
                                },
                                paint: {
                                    'text-color': route.color,
                                    'text-halo-color': resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                                    'text-halo-width': 2,
                                    'text-opacity': opacity
                                },
                                minzoom: 12.5
                            });
                            routeSourcesRef.current.add(labelSourceId);
                        }
                    }
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
                            paint: { 'line-color': route.color, 'line-width': width - 1, 'line-opacity': opacity - 0.2, 'line-dasharray': [2, 2] },
                        });
                        routeSourcesRef.current.add(sourceId);
                    }
                }
            }
        };

        if (map.isStyleLoaded()) handleStyleLoad();
        map.on('style.load', handleStyleLoad);
        return () => { map.off('style.load', handleStyleLoad); };
    }, [visibleRoutes, state.stops, state.settings, state.selectedRouteId, resolvedTheme]);

    // Fit bounds
    useEffect(() => {
        const map = mapRef.current;
        if (!map || visibleStops.length === 0) return;

        const bounds = new mapboxgl.LngLatBounds();
        const stopsToFit = state.selectedRouteId ? visibleStops.filter(s => s.routeId === state.selectedRouteId) : visibleStops;

        for (const stop of stopsToFit) {
            if (stop.coordinates) bounds.extend(stop.coordinates);
        }
        if (state.settings.depotCoords) bounds.extend(state.settings.depotCoords);

        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 });
        }
    }, [visibleStops.length, state.selectedRouteId, state.stops]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Toggle overlays
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        for (const marker of markersRef.current.values()) {
            const el = marker.getElement();
            const countEl = el.querySelector('.marker-count') as HTMLElement;
            if (countEl) {
                countEl.style.display = state.overlays.showBagCount ? 'block' : 'none';
            }
        }
    }, [state.overlays, visibleStops]);

    return (
        <div style={{ flex: 1, position: 'relative' }}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
            <div style={{ position: 'absolute', bottom: 24, right: 24, background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', zIndex: 10, fontSize: 13, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Legend</h4>
                {state.activeServiceMode === 'mulch' ? (
                    <>
                        {(state.settings.mulchTypes || []).map(t => (
                            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 14, height: 14, minWidth: 14, borderRadius: '50%', background: getMulchColor(t) }} /> {t}
                            </div>
                        ))}
                    </>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 14, height: 14, minWidth: 14, borderRadius: '50%', background: '#6366f1' }} /> Spreading Only</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 14, height: 14, minWidth: 14, borderRadius: '50%', background: '#9ca3af' }} /> Disabled</div>

                {visibleRoutes.length > 0 && (
                    <>
                        <div style={{ margin: '4px 0', borderTop: '1px solid var(--border)' }} />
                        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Routes</h4>
                        {visibleRoutes.map(r => (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 14, height: 14, minWidth: 14, borderRadius: '50%', background: r.color }} />
                                <span style={{ maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>{r.name}</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
            {state.isManualRouteMode && (
                <div className="map-mode-indicator">
                    <span>📍 Manual Route Mode — Click markers to add to route</span>
                    <button onClick={() => dispatch({ type: 'CLEAR_MANUAL_ROUTE' })} className="btn btn-xs btn-outline">Exit</button>
                </div>
            )}
        </div>
    );
}
