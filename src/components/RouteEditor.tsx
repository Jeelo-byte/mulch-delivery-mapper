'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAppState, useAppDispatch } from '@/src/lib/store';
import {
    DragDropContext,
    Droppable,
    Draggable,
    type DropResult,
} from '@hello-pangea/dnd';
import {
    Eye,
    EyeOff,
    Route as RouteIcon,
    Zap,
    Clock,
    GripVertical,
    X,
    Navigation,
    Plus,
    Wand2,
    Trash2,
    AlertCircle,
    CheckCircle,
    MapPin,
    Edit3,
    Download,
    FileText,
    ArrowUpDown,
} from 'lucide-react';
import { optimizeRoute, getRouteDirections } from '@/src/lib/route-optimizer';
import { smartAutoGenerate } from '@/src/lib/auto-route-generator';
import { geocodeAddress } from '@/src/lib/geocoder';
import { exportRoutesToCSV, downloadCSV, exportRoutesToPDF } from '@/src/lib/route-export';
import type { MulchType, DeliveryStop } from '@/src/lib/types';

const MULCH_TYPES: MulchType[] = ['Black', 'Aromatic Cedar', 'Fine Shredded Hardwood'];

type StopMetric = 'bags' | 'mulchType' | 'scout' | 'orderDate' | 'orderId' | 'phone' | 'email' | 'notes';

const METRIC_LABELS: Record<StopMetric, string> = {
    bags: 'Bags & Mulch Type',
    mulchType: 'Mulch Type Only',
    scout: 'Scout Name',
    orderDate: 'Order Date',
    orderId: 'Order ID',
    phone: 'Phone',
    email: 'Email',
    notes: 'Fulfillment Notes',
};

function getStopMetricValue(stop: DeliveryStop, metric: StopMetric, activeMode: 'mulch' | 'spreading'): string {
    switch (metric) {
        case 'bags':
            if (activeMode === 'spreading' && stop.spreadingOrder) {
                return `${stop.spreadingOrder.quantity} bags (Spread)`;
            }
            return `${stop.totalBags} bags • ${stop.mulchOrders.map(o => o.mulchType).join(', ')}`;
        case 'mulchType':
            if (activeMode === 'spreading' && stop.spreadingOrder) {
                return `Spreading`;
            }
            return stop.mulchOrders.map(o => `${o.quantity}× ${o.mulchType}`).join(', ');
        case 'scout': return stop.mulchOrders.map(o => o.scoutName).filter(Boolean).join(', ') || '—';
        case 'orderDate': return stop.orderDate || '—';
        case 'orderId': return stop.orderId || '—';
        case 'phone': return stop.recipientPhone || '—';
        case 'email': return stop.recipientEmail || '—';
        case 'notes': return stop.fulfillmentNotes || '—';
    }
}

export function RouteEditor() {
    const state = useAppState();
    const dispatch = useAppDispatch();
    const [optimizing, setOptimizing] = useState<string | null>(null);
    const [showAutoGen, setShowAutoGen] = useState(false);
    const [showCreateRoute, setShowCreateRoute] = useState(false);
    const [autoErrors, setAutoErrors] = useState<string[]>([]);
    const [autoSummary, setAutoSummary] = useState<string[]>([]);
    const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
    const [editingRouteName, setEditingRouteName] = useState('');
    const [stopMetric, setStopMetric] = useState<StopMetric>('bags');
    const [sortBy, setSortBy] = useState<'default' | 'vehicle'>('vehicle');
    const [autoGenStrategy, setAutoGenStrategy] = useState<'standard' | 'efficient'>('efficient');
    const [collapsedRoutes, setCollapsedRoutes] = useState<Record<string, boolean>>({});

    // Smart auto-gen state
    const vehicles = Object.values(state.vehicles).filter(v => v.serviceMode === state.activeServiceMode);
    const [vehicleAssignments, setVehicleAssignments] = useState<
        { vehicleId: string; mulchType: string }[]
    >([]);

    useEffect(() => {
        // Reset generator state when switching modes
        setVehicleAssignments([]);
        setShowAutoGen(false);
        setAutoErrors([]);
        setAutoSummary([]);
    }, [state.activeServiceMode]);

    useEffect(() => {
        if (showAutoGen && vehicles.length > 0 && vehicleAssignments.length === 0) {
            const initial = vehicles.map((v, i) => ({
                vehicleId: v.id,
                mulchType: state.activeServiceMode === 'spreading' ? '' : (i < MULCH_TYPES.length ? MULCH_TYPES[i] : ''),
            }));
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setVehicleAssignments(initial);
        }
    }, [showAutoGen, vehicles, vehicleAssignments.length, state.activeServiceMode]);

    const [newRouteName, setNewRouteName] = useState('');
    const [newRouteVehicle, setNewRouteVehicle] = useState('');
    const [newRouteMulchType, setNewRouteMulchType] = useState<string>('');

    const allRoutes = Object.values(state.routes).filter(r => r.serviceMode === state.activeServiceMode);
    const unassignedStops = state.stopOrder
        .map(id => state.stops[id])
        .filter(s => {
            if (!s || s.isDisabled) return false;
            // Mode-specific filtering
            if (state.activeServiceMode === 'mulch') {
                if (s.routeId) return false;
                if (!s.mulchOrders || s.mulchOrders.length === 0) return false;
            } else if (state.activeServiceMode === 'spreading') {
                if (s.spreadingRouteId) return false;
                if (!s.spreadingOrder) return false;
            }
            return true;
        });

    // Sort routes by vehicle
    const sortedRoutes = useMemo(() => {
        if (sortBy === 'vehicle') {
            return [...allRoutes].sort((a, b) => {
                const va = state.vehicles[a.vehicleId]?.name || '';
                const vb = state.vehicles[b.vehicleId]?.name || '';
                if (va !== vb) return va.localeCompare(vb);
                return a.name.localeCompare(b.name);
            });
        }
        return allRoutes;
    }, [allRoutes, sortBy, state.vehicles]);

    // Group routes by vehicle for section headers
    const routesByVehicle = useMemo(() => {
        if (sortBy !== 'vehicle') return null;
        const groups: { vehicleName: string; vehicleId: string; routes: typeof allRoutes }[] = [];
        const map = new Map<string, typeof allRoutes>();
        for (const r of sortedRoutes) {
            const vid = r.vehicleId;
            if (!map.has(vid)) map.set(vid, []);
            map.get(vid)!.push(r);
        }
        for (const [vid, routes] of map) {
            const v = state.vehicles[vid];
            groups.push({ vehicleName: v?.name || 'Unknown', vehicleId: vid, routes });
        }
        return groups;
    }, [sortedRoutes, sortBy, state.vehicles]);

    const handleDragEnd = (result: DropResult) => {
        const { source, destination, draggableId } = result;
        if (!destination) return;
        const sourceRouteId = source.droppableId;
        const destRouteId = destination.droppableId;
        if (sourceRouteId === destRouteId) {
            const route = state.routes[sourceRouteId];
            if (!route) return;
            const newStopIds = [...route.stopIds];
            newStopIds.splice(source.index, 1);
            newStopIds.splice(destination.index, 0, draggableId);
            dispatch({ type: 'REORDER_ROUTE_STOPS', payload: { routeId: sourceRouteId, stopIds: newStopIds } });
        } else {
            dispatch({
                type: 'MOVE_STOP_BETWEEN_ROUTES',
                payload: { stopId: draggableId, sourceRouteId, destRouteId, destIndex: destination.index },
            });
        }
    };

    const handleOptimize = async (routeId: string, mode: 'distance' | 'duration') => {
        const route = state.routes[routeId];
        if (!route || route.stopIds.length < 2) return;
        setOptimizing(routeId);

        const stops = route.stopIds.map(id => state.stops[id]).filter(s => s?.coordinates);
        const result = await optimizeRoute(stops, mode);
        dispatch({ type: 'REORDER_ROUTE_STOPS', payload: { routeId, stopIds: result.orderedIds } });

        if (result.geometry) {
            dispatch({ type: 'SET_ROUTE_GEOMETRY', payload: { routeId, geometry: result.geometry } });
        } else {
            const orderedStops = result.orderedIds.map(id => state.stops[id]).filter(Boolean);
            const geometry = await getRouteDirections(orderedStops);
            if (geometry) dispatch({ type: 'SET_ROUTE_GEOMETRY', payload: { routeId, geometry } });
        }

        await fetchRouteStats(routeId, result.orderedIds);
        setOptimizing(null);
    };

    const fetchRouteStats = async (routeId: string, stopIds: string[]) => {
        const route = state.routes[routeId];
        const depotCoords = state.settings.depotCoords;
        const validStops = stopIds.map(id => state.stops[id]).filter(s => s?.coordinates);

        const coordsArr: string[] = [];
        if (depotCoords) coordsArr.push(`${depotCoords[0]},${depotCoords[1]}`);
        validStops.slice(0, 23).forEach(s => coordsArr.push(`${s.coordinates![0]},${s.coordinates![1]}`));

        if (coordsArr.length < 2) return;
        const coordsStr = coordsArr.join(';');

        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?access_token=${token}&overview=false`;
            const resp = await fetch(url);
            if (!resp.ok) return;
            const data = await resp.json();
            if (data.routes?.[0]) {
                const distanceMiles = data.routes[0].distance * 0.000621371;
                const durationMinutes = data.routes[0].duration / 60;

                const legStats = data.routes[0].legs.map((leg: { distance: number; duration: number }) => ({
                    distanceMiles: leg.distance * 0.000621371,
                    durationMinutes: leg.duration / 60
                }));

                // If depotCoords is present, the first leg is Depot -> Stop 1, which might be useful,
                // but Mapbox returns N-1 legs for N coordinates.
                dispatch({ type: 'SET_ROUTE_STATS', payload: { routeId, distanceMiles, durationMinutes, legStats } });
            }
        } catch { }
    };



    const handleSmartGenerate = () => {
        if (vehicleAssignments.length === 0) return;
        setAutoErrors([]); setAutoSummary([]);
        const result = smartAutoGenerate(state, {
            strategy: autoGenStrategy,
            vehicleAssignments: vehicleAssignments.map(a => ({ vehicleId: a.vehicleId, mulchType: a.mulchType ? a.mulchType as MulchType : null })),
            depotCoords: state.settings.depotCoords,
        });
        setAutoErrors(result.errors); setAutoSummary(result.summary);
        if (result.routes.length > 0) {
            dispatch({ type: 'BATCH_CREATE_ROUTES', payload: result.routes });
            dispatch({ type: 'BATCH_ASSIGN_STOPS', payload: { assignments: result.assignments } });
        }
    };

    const handleCreateRoute = () => {
        if (!newRouteName || !newRouteVehicle) return;
        const routeId = `route-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
        dispatch({
            type: 'CREATE_ROUTE',
            payload: { id: routeId, name: newRouteName, vehicleId: newRouteVehicle, mulchType: newRouteMulchType ? newRouteMulchType as MulchType : null, stopIds: [], color: colors[allRoutes.length % colors.length], visible: true, optimized: false, routeGeometry: null, distanceMiles: null, durationMinutes: null, serviceMode: state.activeServiceMode },
        });
        dispatch({ type: 'SELECT_ROUTE', payload: routeId });
        setNewRouteName(''); setNewRouteVehicle(''); setNewRouteMulchType(''); setShowCreateRoute(false);
    };

    const handleSelectRoute = (routeId: string) => {
        dispatch({ type: 'SELECT_ROUTE', payload: state.selectedRouteId === routeId ? null : routeId });
    };

    const handleExportCSV = (routeIds?: string[]) => {
        const csv = exportRoutesToCSV(state, routeIds);
        const name = routeIds?.length === 1 ? state.routes[routeIds[0]]?.name?.replace(/\s+/g, '_') || 'route' : 'all_routes';
        downloadCSV(csv, `mulch_delivery_${name}_${new Date().toISOString().split('T')[0]}.csv`);
    };

    const handleExportPDF = (routeIds?: string[]) => {
        exportRoutesToPDF(state, routeIds);
    };

    const renderRouteCard = (route: typeof allRoutes[0]) => {
        const vehicle = state.vehicles[route.vehicleId];
        const totalBags = route.stopIds.reduce((sum, id) => {
            const stop = state.stops[id];
            if (!stop) return sum;
            return sum + (state.activeServiceMode === 'spreading' ? (stop.spreadingOrder?.quantity || 0) : stop.totalBags);
        }, 0);
        const isSelected = state.selectedRouteId === route.id;

        return (
            <div
                key={route.id}
                className={`route-card ${isSelected ? 'route-card-selected' : ''}`}
                style={{ borderLeftColor: route.color }}
            >
                <div className="route-card-header" style={{ cursor: 'pointer' }} onClick={() => setCollapsedRoutes(prev => ({ ...prev, [route.id]: !prev[route.id] }))}>
                    <div className="route-card-title">
                        {editingRouteId === route.id ? (
                            <input
                                className="input input-sm route-name-input"
                                value={editingRouteName}
                                onChange={(e) => setEditingRouteName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') { dispatch({ type: 'UPDATE_ROUTE', payload: { id: route.id, name: editingRouteName } }); setEditingRouteId(null); }
                                    else if (e.key === 'Escape') setEditingRouteId(null);
                                }}
                                onBlur={() => { dispatch({ type: 'UPDATE_ROUTE', payload: { id: route.id, name: editingRouteName } }); setEditingRouteId(null); }}
                                autoFocus
                                style={{ color: route.color, fontWeight: 700 }}
                            />
                        ) : (
                            <span className="route-name" style={{ color: route.color, cursor: 'pointer' }} onClick={() => handleSelectRoute(route.id)} onDoubleClick={(e) => { e.stopPropagation(); setEditingRouteId(route.id); setEditingRouteName(route.name); }} title="Click to edit on map, double-click to rename">
                                {isSelected && <Edit3 size={12} style={{ marginRight: 4 }} />}
                                {route.name}
                            </span>
                        )}
                    </div>
                    <div className="route-card-actions" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setCollapsedRoutes(prev => ({ ...prev, [route.id]: prev[route.id] !== undefined ? !prev[route.id] : false }))} className="btn btn-xs btn-ghost" title="Toggle stops">{collapsedRoutes[route.id] !== false ? 'Expand' : 'Collapse'}</button>
                        <button onClick={() => handleExportCSV([route.id])} className="btn btn-xs btn-ghost" title="Export CSV"><Download size={12} /></button>
                        <button onClick={() => handleExportPDF([route.id])} className="btn btn-xs btn-ghost" title="Print/PDF"><FileText size={12} /></button>
                        <button onClick={() => dispatch({ type: 'TOGGLE_ROUTE_VISIBILITY', payload: route.id })} className="btn btn-xs btn-ghost" title={route.visible ? 'Hide' : 'Show'}>
                            {route.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button onClick={() => dispatch({ type: 'SET_DRIVE_MODE', payload: { enabled: true, routeId: route.id } })} className="btn btn-xs btn-ghost" title="Drive Mode"><Navigation size={14} /></button>
                        <button onClick={() => dispatch({ type: 'DELETE_ROUTE', payload: route.id })} className="btn btn-xs btn-ghost btn-danger" title="Delete"><Trash2 size={14} /></button>
                    </div>
                </div>

                <div className="route-meta">
                    <select className="input input-xs" value={route.vehicleId} onChange={(e) => dispatch({ type: 'UPDATE_ROUTE', payload: { id: route.id, vehicleId: e.target.value } })} title="Change vehicle">
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <span className="route-stat">{route.stopIds.length} stops</span>
                    <span className="route-stat">{totalBags} bags</span>
                    {vehicle && vehicle.maxBagCapacity !== 9999 && <span className={`route-stat ${totalBags > vehicle.maxBagCapacity ? 'route-over-capacity' : ''}`}>{Math.round((totalBags / vehicle.maxBagCapacity) * 100)}%</span>}
                    {route.mulchType && <span className="route-stat">{route.mulchType}</span>}
                    {route.distanceMiles != null && <span className="route-stat">{route.distanceMiles.toFixed(1)} mi</span>}
                    {route.durationMinutes != null && <span className="route-stat">{Math.round(route.durationMinutes)} min</span>}
                </div>

                <div className="route-controls">
                    <div className="route-optimize-btns">
                        <button onClick={() => handleOptimize(route.id, 'distance')} disabled={optimizing === route.id || route.stopIds.length < 2} className="btn btn-xs btn-outline" title="Optimize distance">
                            {optimizing === route.id ? '...' : <><Zap size={12} /> Dist</>}
                        </button>
                        <button onClick={() => handleOptimize(route.id, 'duration')} disabled={optimizing === route.id || route.stopIds.length < 2} className="btn btn-xs btn-outline" title="Optimize time">
                            {optimizing === route.id ? '...' : <><Clock size={12} /> Time</>}
                        </button>
                        <button onClick={() => handleSelectRoute(route.id)} className={`btn btn-xs ${isSelected ? 'btn-primary' : 'btn-outline'}`} title={isSelected ? 'Stop editing' : 'Click markers on map'}>
                            <MapPin size={12} /> {isSelected ? 'Editing' : 'Edit'}
                        </button>
                    </div>
                </div>

                {collapsedRoutes[route.id] === false && (
                    <Droppable droppableId={route.id}>
                        {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className={`route-stop-list ${snapshot.isDraggingOver ? 'route-stop-list-active' : ''}`}>
                                {route.stopIds.map((stopId, index) => {
                                    const stop = state.stops[stopId];
                                    if (!stop) return null;
                                    const streetAddr = stop.fullAddress.split(',')[0]?.trim() || '';
                                    return (
                                        <Draggable key={stopId} draggableId={stopId} index={index}>
                                            {(p2, s2) => (
                                                <div ref={p2.innerRef} {...p2.draggableProps} className={`route-stop-item ${s2.isDragging ? 'route-stop-dragging' : ''}`}>
                                                    <span {...p2.dragHandleProps} className="drag-handle"><GripVertical size={14} /></span>
                                                    <span className="route-stop-num">{index + 1}</span>
                                                    <div className="route-stop-info">
                                                        <span className="route-stop-name">
                                                            {stop.isDisabled && <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)', marginRight: 4 }}>[Disabled]</span>}
                                                            {stop.hasCriticalNote && <span title="Critical Note: >15 chars"><AlertCircle size={14} color="var(--color-danger)" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /></span>}
                                                            {stop.recipientName}
                                                            {stop.hasFrontWalk && <span title="Front Walk" style={{ marginLeft: 6 }}>🚶</span>}
                                                            {stop.hasSideHouse && <span title="Side House" style={{ marginLeft: 6 }}>🏠</span>}
                                                        </span>
                                                        <span className="route-stop-address">{streetAddr} • {stop.postalCode}</span>
                                                        <span className="route-stop-detail">{getStopMetricValue(stop, stopMetric, state.activeServiceMode)}</span>
                                                    </div>
                                                    <button onClick={() => dispatch({ type: 'TOGGLE_STOP_DISABLED', payload: stop.id })} className={`btn btn-xs btn-ghost ${stop.isDisabled ? 'btn-primary' : ''}`} title={stop.isDisabled ? "Enable stop" : "Disable stop"}>
                                                        {stop.isDisabled ? <Eye size={12} /> : <EyeOff size={12} />}
                                                    </button>
                                                    <button onClick={() => dispatch({ type: 'REMOVE_STOP_FROM_ROUTE', payload: { stopId, routeId: route.id } })} className="btn btn-xs btn-ghost" title="Remove from route"><X size={12} /></button>
                                                    {/* Leg Stat Rendering */}
                                                    {route.legStats && (route.legStats.length > index + (state.settings.depotCoords ? 1 : 0)) && (
                                                        <div style={{ position: 'absolute', bottom: '-26px', left: '44px', display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 11, zIndex: 0 }}>
                                                            <div style={{ borderLeft: '2px dashed var(--border)', height: 20, marginRight: 8 }}></div>
                                                            ↓ {route.legStats[index + (state.settings.depotCoords ? 1 : 0)].distanceMiles.toFixed(1)} mi ({Math.round(route.legStats[index + (state.settings.depotCoords ? 1 : 0)].durationMinutes)} min)
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </Draggable>
                                    );
                                })}
                                {provided.placeholder}
                                {route.stopIds.length === 0 && (
                                    <p className="empty-state-sm">{isSelected ? 'Click markers on the map to add stops' : 'Click Edit to add stops from the map'}</p>
                                )}
                            </div>
                        )
                        }
                    </Droppable >
                )}
            </div >
        );
    };

    return (
        <div className="route-editor">
            <div className="section-header">
                <h3 className="section-title">
                    <RouteIcon size={16} /> Routes
                    {unassignedStops.length > 0 && <span className="unassigned-badge">{unassignedStops.length} unassigned</span>}
                </h3>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => { setShowAutoGen(!showAutoGen); setAutoErrors([]); setAutoSummary([]); }} className="btn btn-xs btn-outline" title="Auto-generate"><Wand2 size={12} /> Auto</button>
                    <button onClick={() => setShowCreateRoute(!showCreateRoute)} className="btn btn-xs btn-outline" title="Create manually"><Plus size={12} /></button>
                </div>
            </div>

            {/* Controls bar: sort, metric, export all */}
            {allRoutes.length > 0 && (
                <div className="route-controls-bar">
                    <div className="route-controls-left">
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'default' | 'vehicle')} className="input input-xs" title="Sort routes">
                            <option value="default">Default Order</option>
                            <option value="vehicle">By Vehicle</option>
                        </select>
                        <select value={stopMetric} onChange={(e) => setStopMetric(e.target.value as StopMetric)} className="input input-xs" title="Display metric">
                            {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <div className="route-controls-right">
                        <button onClick={() => handleExportCSV()} className="btn btn-xs btn-outline" title="Export all CSV"><Download size={12} /> CSV</button>
                        <button onClick={() => handleExportPDF()} className="btn btn-xs btn-outline" title="Print all PDF"><FileText size={12} /> PDF</button>
                    </div>
                </div>
            )}

            {/* Edit mode indicator */}
            {state.selectedRouteId && state.routes[state.selectedRouteId] && (
                <div className="edit-mode-banner" style={{ borderLeftColor: state.routes[state.selectedRouteId].color }}>
                    <Edit3 size={14} />
                    <span>Editing: <strong>{state.routes[state.selectedRouteId].name}</strong></span>
                    <span className="edit-mode-hint">Click markers on map to add stops</span>
                    <button onClick={() => dispatch({ type: 'SELECT_ROUTE', payload: null })} className="btn btn-xs btn-ghost">Done</button>
                </div>
            )}

            {/* Errors/Summary */}
            {autoErrors.length > 0 && (
                <div className="auto-gen-errors">
                    {autoErrors.map((err, i) => <div key={i} className="auto-gen-error"><AlertCircle size={14} /><span>{err}</span></div>)}
                    <button onClick={() => setAutoErrors([])} className="btn btn-xs btn-ghost">Dismiss</button>
                </div>
            )}
            {autoSummary.length > 0 && (
                <div className="auto-gen-summary">
                    {autoSummary.map((msg, i) => <div key={i} className="auto-gen-summary-item"><CheckCircle size={14} /><span>{msg}</span></div>)}
                    <button onClick={() => setAutoSummary([])} className="btn btn-xs btn-ghost">Dismiss</button>
                </div>
            )}

            {/* Auto-gen panel */}
            {showAutoGen && (
                <div className="auto-gen-panel">
                    <h4 className="auto-gen-title">🚛 Smart Route Generator</h4>
                    <p className="auto-gen-desc">Assign a mulch type to each vehicle. Leave blank for hotshot (any type).</p>
                    <div className="form-field" style={{ marginBottom: 12 }}>
                        <label className="form-label">🧠 Strategy</label>
                        <select value={autoGenStrategy} onChange={(e) => setAutoGenStrategy(e.target.value as 'standard' | 'efficient')} className="input input-sm">
                            <option value="efficient">Distance-Based (Trucks near, Trailers far)</option>
                            <option value="standard">Standard Clustering</option>
                        </select>
                    </div>
                    <div className="form-field" style={{ marginBottom: 12 }}>
                        <label className="form-label">🛻 Vehicle Assignments</label>
                        {vehicles.length === 0 && <p className="empty-state-sm">Add vehicles first.</p>}
                        {vehicleAssignments.map((a, i) => {
                            const v = state.vehicles[a.vehicleId];
                            if (!v) return null;
                            return (
                                <div key={a.vehicleId} className="vehicle-assignment-row">
                                    <span className="vehicle-assignment-name">{v.name} {v.maxBagCapacity !== 9999 ? `(${v.maxBagCapacity})` : ''}</span>
                                    {state.activeServiceMode !== 'spreading' && (
                                        <select value={a.mulchType} onChange={(e) => { const u = [...vehicleAssignments]; u[i] = { ...u[i], mulchType: e.target.value }; setVehicleAssignments(u); }} className="input input-sm" style={{ minWidth: 140 }}>
                                            <option value="">🔥 Hotshot (any)</option>
                                            {MULCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="auto-gen-actions">
                        <button onClick={() => setShowAutoGen(false)} className="btn btn-xs btn-ghost">Cancel</button>
                        <button onClick={handleSmartGenerate} disabled={vehicles.length === 0 || unassignedStops.length === 0} className="btn btn-xs btn-primary">
                            <Wand2 size={12} /> Generate ({unassignedStops.length} stops)
                        </button>
                    </div>
                </div>
            )}

            {/* Manual route creation */}
            {showCreateRoute && (
                <div className="auto-gen-panel">
                    <h4 className="auto-gen-title">Create Route</h4>
                    <div className="form-grid">
                        <div className="form-field">
                            <label className="form-label">Name</label>
                            <input value={newRouteName} onChange={(e) => setNewRouteName(e.target.value)} className="input input-sm" placeholder="Route A" />
                        </div>
                        <div className="form-field">
                            <label className="form-label">Vehicle</label>
                            <select value={newRouteVehicle} onChange={(e) => setNewRouteVehicle(e.target.value)} className="input input-sm">
                                <option value="">Select...</option>
                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                        </div>
                        {state.activeServiceMode !== 'spreading' && (
                            <div className="form-field">
                                <label className="form-label">Mulch Lock</label>
                                <select value={newRouteMulchType} onChange={(e) => setNewRouteMulchType(e.target.value)} className="input input-sm">
                                    <option value="">Any</option>
                                    {MULCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                    <div className="auto-gen-actions">
                        <button onClick={() => setShowCreateRoute(false)} className="btn btn-xs btn-ghost">Cancel</button>
                        <button onClick={handleCreateRoute} disabled={!newRouteName || !newRouteVehicle} className="btn btn-xs btn-primary"><Plus size={12} /> Create</button>
                    </div>
                </div>
            )}

            {/* Route cards */}
            <DragDropContext onDragEnd={handleDragEnd}>
                {sortBy === 'vehicle' && routesByVehicle ? (
                    routesByVehicle.map(group => (
                        <div key={group.vehicleId} className="vehicle-group">
                            {group.routes.map(route => renderRouteCard(route))}
                        </div>
                    ))
                ) : (
                    sortedRoutes.map(route => renderRouteCard(route))
                )}
            </DragDropContext>

            {allRoutes.length === 0 && !showAutoGen && !showCreateRoute && (
                <p className="empty-state">
                    {vehicles.length === 0 ? 'Add a vehicle first, then create routes.' : 'Click "Auto" to generate or "+" to create manually.'}
                </p>
            )}
        </div>
    );
}
