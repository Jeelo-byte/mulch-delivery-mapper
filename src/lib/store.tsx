'use client';

import React, { createContext, useContext, useReducer, useEffect, type Dispatch } from 'react';
import type { AppState, AppAction } from './types';

const STORAGE_KEY = 'mulch-route-optimizer-state';

const todayISO = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

const defaultSettings = {
    fuelCostPerMile: 0.655,
    depotAddress: '',
    depotCoords: null as [number, number] | null,
    defaultCapacity: 50,
    mapboxToken: '',
    enforceWeightLimits: false,
    laborTimePerSpreadBag: 3,
    timeSpentPerDeliveryBag: 2,
    routeGenerationMode: 'Geographic' as const,
    deliveryStartTime: '08:00',
    spreadingStartTime: '09:00',
    deliveryDate: todayISO,
    spreadingDate: todayISO,
    lunchBreakStartTime: '12:00',
    lunchBreakDuration: 30,
};

const initialState: AppState = {
    rawCSVData: [],
    lineItems: [],
    stops: {},
    stopOrder: [],
    vehicles: {},
    routes: {},
    settings: defaultSettings,
    activeServiceMode: 'mulch',
    filters: {
        mulchTypes: [],
        vehicleTypes: [],
        vehicleId: null,
        showUnassigned: true,
        showHotshotsOnly: false,
        showDisabled: true,
    },
    overlays: {
        showScoutName: false,
        showBagCount: true,
        showSpecialInstructions: false,
    },
    selectedStopId: null,
    selectedRouteId: null,
    isManualRouteMode: false,
    manualRouteStops: [],
    isDriveMode: false,
    driveModRouteId: null,
    driveModeStopIndex: 0,
    isLoading: false,
    geocodingProgress: 0,
    totalToGeocode: 0,
};

/** Save state to localStorage (only persistent parts) */
function saveState(state: AppState) {
    try {
        const toSave = {
            rawCSVData: state.rawCSVData,
            lineItems: state.lineItems,
            stops: state.stops,
            stopOrder: state.stopOrder,
            vehicles: state.vehicles,
            routes: state.routes,
            settings: state.settings,
            activeServiceMode: state.activeServiceMode,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.warn('Failed to save state:', e);
    }
}

/** Load state from localStorage */
function loadSavedState(): Partial<AppState> | null {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        return JSON.parse(saved);
    } catch (e) {
        console.warn('Failed to load state:', e);
        return null;
    }
}

function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'LOAD_CSV':
            return {
                ...state,
                rawCSVData: action.payload.raw,
                lineItems: action.payload.lineItems,
                stops: action.payload.stops,
                stopOrder: action.payload.stopOrder,
            };

        case 'SET_COORDINATES':
            return {
                ...state,
                stops: {
                    ...state.stops,
                    [action.payload.stopId]: {
                        ...state.stops[action.payload.stopId],
                        coordinates: action.payload.coordinates,
                    },
                },
            };

        case 'SET_HOTSHOT':
            return {
                ...state,
                stops: {
                    ...state.stops,
                    [action.payload.stopId]: {
                        ...state.stops[action.payload.stopId],
                        isHotshot: action.payload.isHotshot,
                    },
                },
            };

        case 'ADD_STOP':
            return {
                ...state,
                stops: { ...state.stops, [action.payload.id]: action.payload },
                stopOrder: [...state.stopOrder, action.payload.id],
            };

        case 'UPDATE_STOP':
            return {
                ...state,
                stops: { ...state.stops, [action.payload.id]: action.payload },
            };

        case 'REMOVE_STOP': {
            const { [action.payload]: removedStop, ...remainingStops } = state.stops;
            const updRoutes = { ...state.routes };
            if (removedStop) {
                [removedStop.routeId, removedStop.spreadingRouteId].forEach(rId => {
                    if (rId && updRoutes[rId]) {
                        updRoutes[rId] = {
                            ...updRoutes[rId],
                            stopIds: updRoutes[rId].stopIds.filter(id => id !== action.payload),
                        };
                    }
                });
            }
            return {
                ...state,
                stops: remainingStops,
                stopOrder: state.stopOrder.filter(id => id !== action.payload),
                routes: updRoutes,
                selectedStopId: state.selectedStopId === action.payload ? null : state.selectedStopId,
            };
        }

        case 'TOGGLE_STOP_DISABLED': {
            const stop = state.stops[action.payload];
            if (!stop) return state;
            const wasDisabled = stop.isDisabled;
            const updatedStop = { ...stop, isDisabled: !wasDisabled };

            // If being disabled and in a route, remove from route
            let newRoutes = state.routes;
            if (!wasDisabled) {
                [stop.routeId, stop.spreadingRouteId].forEach(rId => {
                    if (rId && newRoutes[rId]) {
                        newRoutes = {
                            ...newRoutes,
                            [rId]: {
                                ...newRoutes[rId],
                                stopIds: newRoutes[rId].stopIds.filter(id => id !== action.payload),
                            },
                        };
                    }
                });
                updatedStop.routeId = null;
                updatedStop.spreadingRouteId = null;
            }

            return {
                ...state,
                stops: { ...state.stops, [action.payload]: updatedStop },
                routes: newRoutes,
            };
        }

        case 'ADD_VEHICLE':
            return {
                ...state,
                vehicles: { ...state.vehicles, [action.payload.id]: action.payload },
            };

        case 'UPDATE_VEHICLE':
            return {
                ...state,
                vehicles: { ...state.vehicles, [action.payload.id]: action.payload },
            };

        case 'REMOVE_VEHICLE': {
            const { [action.payload]: _, ...remaining } = state.vehicles;
            const routesToRemove = Object.values(state.routes).filter(
                (r) => r.vehicleId === action.payload
            );
            const updatedRoutes = { ...state.routes };
            const updatedStops = { ...state.stops };
            for (const route of routesToRemove) {
                for (const stopId of route.stopIds) {
                    if (updatedStops[stopId]) {
                        if (route.serviceMode === 'spreading') {
                            updatedStops[stopId] = { ...updatedStops[stopId], spreadingRouteId: null };
                        } else {
                            updatedStops[stopId] = { ...updatedStops[stopId], routeId: null };
                        }
                    }
                }
                delete updatedRoutes[route.id];
            }
            void _;
            return { ...state, vehicles: remaining, routes: updatedRoutes, stops: updatedStops };
        }

        case 'CREATE_ROUTE':
            return {
                ...state,
                routes: { ...state.routes, [action.payload.id]: action.payload },
            };

        case 'UPDATE_ROUTE':
            return {
                ...state,
                routes: {
                    ...state.routes,
                    [action.payload.id]: {
                        ...state.routes[action.payload.id],
                        ...action.payload,
                    },
                },
            };

        case 'DELETE_ROUTE': {
            const route = state.routes[action.payload];
            if (!route) return state;
            const newStops = { ...state.stops };
            for (const stopId of route.stopIds) {
                if (newStops[stopId]) {
                    if (route.serviceMode === 'spreading') {
                        newStops[stopId] = { ...newStops[stopId], spreadingRouteId: null };
                    } else {
                        newStops[stopId] = { ...newStops[stopId], routeId: null };
                    }
                }
            }
            const { [action.payload]: __, ...remainingRoutes } = state.routes;
            void __;
            return { ...state, routes: remainingRoutes, stops: newStops };
        }

        case 'ASSIGN_STOP_TO_ROUTE': {
            const { stopId, routeId, index } = action.payload;
            const route = state.routes[routeId];
            if (!route) return state;
            // Don't assign disabled stops
            if (state.stops[stopId]?.isDisabled) return state;

            // Remove from current route if any
            const updatedRoutes = { ...state.routes };
            const routeKey = route.serviceMode === 'spreading' ? 'spreadingRouteId' : 'routeId';
            const currentRouteId = state.stops[stopId]?.[routeKey];
            if (currentRouteId && updatedRoutes[currentRouteId]) {
                updatedRoutes[currentRouteId] = {
                    ...updatedRoutes[currentRouteId],
                    stopIds: updatedRoutes[currentRouteId].stopIds.filter((id) => id !== stopId),
                    // Clear stale calculation for the route we just modified
                    routeGeometry: null,
                    distanceMiles: null,
                    durationMinutes: null,
                    legStats: undefined,
                };
            }

            // Add to new route (prevent duplicates), and clear its stale calc too
            const newStopIds = [...route.stopIds.filter(id => id !== stopId)];
            if (index !== undefined) {
                newStopIds.splice(index, 0, stopId);
            } else {
                newStopIds.push(stopId);
            }
            updatedRoutes[routeId] = {
                ...updatedRoutes[routeId],
                stopIds: newStopIds,
                routeGeometry: null,
                distanceMiles: null,
                durationMinutes: null,
                legStats: undefined,
            };

            return {
                ...state,
                routes: updatedRoutes,
                stops: {
                    ...state.stops,
                    [stopId]: { ...state.stops[stopId], [routeKey]: routeId },
                },
            };
        }

        case 'REMOVE_STOP_FROM_ROUTE': {
            const { stopId, routeId } = action.payload;
            const route = state.routes[routeId];
            if (!route) return state;
            const routeKey = route.serviceMode === 'spreading' ? 'spreadingRouteId' : 'routeId';
            return {
                ...state,
                routes: {
                    ...state.routes,
                    [routeId]: {
                        ...route,
                        stopIds: route.stopIds.filter((id) => id !== stopId),
                        // Invalidate calculated path – user must recalculate
                        routeGeometry: null,
                        distanceMiles: null,
                        durationMinutes: null,
                        legStats: undefined,
                    },
                },
                stops: {
                    ...state.stops,
                    [stopId]: { ...state.stops[stopId], [routeKey]: null },
                },
            };
        }

        case 'REORDER_ROUTE_STOPS': {
            const { routeId, stopIds } = action.payload;
            const existingRoute = state.routes[routeId];
            if (!existingRoute) return state;

            // Only clear if order actually changed
            const orderChanged = stopIds.some((id, i) => id !== existingRoute.stopIds[i]);

            return {
                ...state,
                routes: {
                    ...state.routes,
                    [routeId]: {
                        ...existingRoute,
                        stopIds,
                        // Wipe stale path data whenever stop order changes
                        ...(orderChanged ? {
                            routeGeometry: null,
                            distanceMiles: null,
                            durationMinutes: null,
                            legStats: undefined,
                        } : {}),
                    },
                },
            };
        }

        case 'MOVE_STOP_BETWEEN_ROUTES': {
            const { stopId, sourceRouteId, destRouteId, destIndex } = action.payload;
            const sourceRoute = state.routes[sourceRouteId];
            const destRoute = state.routes[destRouteId];
            if (!sourceRoute || !destRoute) return state;

            const newSourceStops = sourceRoute.stopIds.filter((id) => id !== stopId);
            const newDestStops = [...destRoute.stopIds.filter(id => id !== stopId)];
            newDestStops.splice(destIndex, 0, stopId);

            const routeKey = destRoute.serviceMode === 'spreading' ? 'spreadingRouteId' : 'routeId';

            return {
                ...state,
                routes: {
                    ...state.routes,
                    // Clear stale calc for both affected routes
                    [sourceRouteId]: {
                        ...sourceRoute,
                        stopIds: newSourceStops,
                        routeGeometry: null,
                        distanceMiles: null,
                        durationMinutes: null,
                        legStats: undefined,
                    },
                    [destRouteId]: {
                        ...destRoute,
                        stopIds: newDestStops,
                        routeGeometry: null,
                        distanceMiles: null,
                        durationMinutes: null,
                        legStats: undefined,
                    },
                },
                stops: {
                    ...state.stops,
                    [stopId]: { ...state.stops[stopId], [routeKey]: destRouteId },
                },
            };
        }

        case 'TOGGLE_ROUTE_VISIBILITY': {
            const route = state.routes[action.payload];
            if (!route) return state;
            return {
                ...state,
                routes: {
                    ...state.routes,
                    [action.payload]: { ...route, visible: !route.visible },
                },
            };
        }

        case 'BATCH_CREATE_ROUTES': {
            const newRoutes = { ...state.routes };
            for (const route of action.payload) {
                // Create routes with empty stopIds — BATCH_ASSIGN handles assignment
                newRoutes[route.id] = { ...route, stopIds: [] };
            }
            return { ...state, routes: newRoutes };
        }

        case 'BATCH_ASSIGN_STOPS': {
            const batchRoutes = { ...state.routes };
            const batchStops = { ...state.stops };
            for (const { stopId, routeId } of action.payload.assignments) {
                if (batchStops[stopId]?.isDisabled) continue; // skip disabled
                const route = batchRoutes[routeId];
                if (!route) continue;
                const routeKey = route.serviceMode === 'spreading' ? 'spreadingRouteId' : 'routeId';

                // Remove from current route if assigned
                const currentRouteId = batchStops[stopId]?.[routeKey];
                if (currentRouteId && batchRoutes[currentRouteId]) {
                    batchRoutes[currentRouteId] = {
                        ...batchRoutes[currentRouteId],
                        stopIds: batchRoutes[currentRouteId].stopIds.filter(id => id !== stopId),
                    };
                }
                // Add to new route (prevent duplicates)
                if (batchRoutes[routeId]) {
                    const existing = new Set(batchRoutes[routeId].stopIds);
                    if (!existing.has(stopId)) {
                        batchRoutes[routeId] = {
                            ...batchRoutes[routeId],
                            stopIds: [...batchRoutes[routeId].stopIds, stopId],
                        };
                    }
                }
                if (batchStops[stopId]) {
                    batchStops[stopId] = { ...batchStops[stopId], [routeKey]: routeId };
                }
            }
            return { ...state, routes: batchRoutes, stops: batchStops };
        }

        case 'SET_SERVICE_MODE':
            return { ...state, activeServiceMode: action.payload };

        case 'SET_FILTERS':
            return {
                ...state,
                filters: { ...state.filters, ...action.payload },
            };

        case 'SET_OVERLAYS':
            return {
                ...state,
                overlays: { ...state.overlays, ...action.payload },
            };

        case 'SET_SETTINGS':
            return {
                ...state,
                settings: { ...state.settings, ...action.payload },
            };

        case 'SELECT_STOP':
            return { ...state, selectedStopId: action.payload };

        case 'SELECT_ROUTE':
            return { ...state, selectedRouteId: action.payload };

        case 'TOGGLE_MANUAL_ROUTE_MODE':
            return {
                ...state,
                isManualRouteMode: !state.isManualRouteMode,
                manualRouteStops: state.isManualRouteMode ? [] : state.manualRouteStops,
            };

        case 'ADD_MANUAL_ROUTE_STOP':
            return {
                ...state,
                manualRouteStops: [...state.manualRouteStops, action.payload],
            };

        case 'CLEAR_MANUAL_ROUTE':
            return { ...state, manualRouteStops: [], isManualRouteMode: false };

        case 'SET_DRIVE_MODE':
            return {
                ...state,
                isDriveMode: action.payload.enabled,
                driveModRouteId: action.payload.routeId || null,
                driveModeStopIndex: 0,
            };

        case 'SET_DRIVE_MODE_INDEX':
            return { ...state, driveModeStopIndex: action.payload };

        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };

        case 'SET_GEOCODING_PROGRESS':
            return {
                ...state,
                geocodingProgress: action.payload.progress,
                totalToGeocode: action.payload.total,
            };

        case 'SET_ROUTE_GEOMETRY': {
            const { routeId, geometry } = action.payload;
            return {
                ...state,
                routes: {
                    ...state.routes,
                    [routeId]: { ...state.routes[routeId], routeGeometry: geometry },
                },
            };
        }

        case 'SET_ROUTE_STATS': {
            const { routeId, distanceMiles, durationMinutes, legStats } = action.payload;
            return {
                ...state,
                routes: {
                    ...state.routes,
                    [routeId]: {
                        ...state.routes[routeId],
                        distanceMiles,
                        durationMinutes,
                        legStats,
                    },
                },
            };
        }

        case 'RESTORE_STATE': {
            const restoredSettings = action.payload.settings || {};
            // Migrate old startTime → deliveryStartTime / spreadingStartTime
            const migratedSettings: Partial<typeof defaultSettings> = { ...restoredSettings };
            if ('startTime' in restoredSettings && !('deliveryStartTime' in restoredSettings)) {
                migratedSettings.deliveryStartTime = (restoredSettings as Record<string, unknown>)['startTime'] as string;
                migratedSettings.spreadingStartTime = (restoredSettings as Record<string, unknown>)['startTime'] as string;
            }
            return {
                ...state,
                ...action.payload,
                settings: { ...defaultSettings, ...migratedSettings }
            };
        }

        default:
            return state;
    }
}

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<Dispatch<AppAction>>(() => { });

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(appReducer, initialState);

    // Load saved state on mount
    useEffect(() => {
        const saved = loadSavedState();
        if (saved && saved.stopOrder && (saved.stopOrder as string[]).length > 0) {
            dispatch({ type: 'RESTORE_STATE', payload: saved });
        }
    }, []);

    // Save state on changes (debounced)
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (state.stopOrder.length > 0) {
                saveState(state);
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [state.stops, state.routes, state.vehicles, state.settings, state.stopOrder]);

    return (
        <AppStateContext.Provider value={state}>
            <AppDispatchContext.Provider value={dispatch}>
                {children}
            </AppDispatchContext.Provider>
        </AppStateContext.Provider>
    );
}

export function useAppState() {
    return useContext(AppStateContext);
}

export function useAppDispatch() {
    return useContext(AppDispatchContext);
}
