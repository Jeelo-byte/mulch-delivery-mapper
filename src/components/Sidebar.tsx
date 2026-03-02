'use client';

import { useState, useMemo } from 'react';
import { useAppState, useAppDispatch } from '@/src/lib/store';
import {
    Search,
    MapPin,
    Package,
    List,
    ChevronLeft,
    ChevronRight,
    Flame,
    Layers,
    Eye,
    EyeOff,
    Tag,
    MessageSquare,
    Ban,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { VehicleManager } from './VehicleManager';
import { RouteEditor } from './RouteEditor';
import type { DeliveryStop, MulchType } from '@/src/lib/types';

type Tab = 'orders' | 'routes' | 'vehicles';

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
    onStopSelect: (stop: DeliveryStop) => void;
    onStopDetail: (stop: DeliveryStop) => void;
    onAddStop: () => void;
}

export function Sidebar({ collapsed, onToggle, onStopSelect, onStopDetail, onAddStop }: SidebarProps) {
    const state = useAppState();
    const dispatch = useAppDispatch();
    const [tab, setTab] = useState<Tab>('orders');
    const [search, setSearch] = useState('');

    const filteredStops = useMemo(() => {
        let stops = state.stopOrder.map((id) => state.stops[id]).filter(Boolean);

        // Search filter
        if (search) {
            const q = search.toLowerCase();
            stops = stops.filter(
                (s) =>
                    s.recipientName.toLowerCase().includes(q) ||
                    s.fullAddress.toLowerCase().includes(q) ||
                    s.mulchOrders.some((o) => o.scoutName.toLowerCase().includes(q))
            );
        }

        // Type filter
        const { filters } = state;
        if (filters.mulchTypes.length > 0) {
            stops = stops.filter((s) =>
                s.mulchOrders.some((o) => filters.mulchTypes.includes(o.mulchType))
            );
        }
        if (filters.showHotshotsOnly) {
            stops = stops.filter((s) => s.isHotshot);
        }
        if (!filters.showDisabled) {
            stops = stops.filter((s) => !s.isDisabled);
        }
        if (filters.vehicleId) {
            const route = Object.values(state.routes).find(
                (r) => r.vehicleId === filters.vehicleId
            );
            if (route) {
                stops = stops.filter((s) => route.stopIds.includes(s.id));
            }
        }

        return stops;
    }, [state, search]);

    const routes = Object.values(state.routes);

    return (
        <>
            <motion.div
                className="sidebar"
                animate={{ width: collapsed ? 0 : 380 }}
                transition={{ duration: 0.3 }}
            >
                {!collapsed && (
                    <div className="sidebar-inner">
                        {/* Tab navigation */}
                        <div className="sidebar-tabs">
                            <button
                                onClick={() => setTab('orders')}
                                className={`sidebar-tab ${tab === 'orders' ? 'sidebar-tab-active' : ''}`}
                            >
                                <List size={16} /> Orders
                            </button>
                            <button
                                onClick={() => setTab('routes')}
                                className={`sidebar-tab ${tab === 'routes' ? 'sidebar-tab-active' : ''}`}
                            >
                                <MapPin size={16} /> Routes
                            </button>
                            <button
                                onClick={() => setTab('vehicles')}
                                className={`sidebar-tab ${tab === 'vehicles' ? 'sidebar-tab-active' : ''}`}
                            >
                                <Package size={16} /> Vehicles
                            </button>
                        </div>

                        {/* Overlay toggles - always visible */}
                        <div className="overlay-toggles">
                            <button
                                onClick={() => dispatch({ type: 'SET_OVERLAYS', payload: { showScoutName: !state.overlays.showScoutName } })}
                                className={`overlay-toggle ${state.overlays.showScoutName ? 'overlay-toggle-active' : ''}`}
                                title="Show Scout Names"
                            >
                                <Tag size={12} /> Scout
                            </button>
                            <button
                                onClick={() => dispatch({ type: 'SET_OVERLAYS', payload: { showBagCount: !state.overlays.showBagCount } })}
                                className={`overlay-toggle ${state.overlays.showBagCount ? 'overlay-toggle-active' : ''}`}
                                title="Show Bag Counts"
                            >
                                <Layers size={12} /> Bags
                            </button>
                            <button
                                onClick={() => dispatch({ type: 'SET_OVERLAYS', payload: { showSpecialInstructions: !state.overlays.showSpecialInstructions } })}
                                className={`overlay-toggle ${state.overlays.showSpecialInstructions ? 'overlay-toggle-active' : ''}`}
                                title="Show Instructions"
                            >
                                <MessageSquare size={12} /> Notes
                            </button>
                        </div>

                        {/* Tab content */}
                        <div className="sidebar-content">
                            <AnimatePresence mode="wait">
                                {tab === 'orders' && (
                                    <motion.div
                                        key="orders"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                    >
                                        <div className="search-wrapper">
                                            <Search size={16} className="search-icon" />
                                            <input
                                                value={search}
                                                onChange={(e) => setSearch(e.target.value)}
                                                placeholder="Search orders..."
                                                className="search-input"
                                            />
                                            <button onClick={onAddStop} className="btn btn-xs btn-primary search-add-btn" title="Add manual stop">
                                                +
                                            </button>
                                        </div>

                                        <div className="order-list">
                                            {filteredStops.map((stop) => (
                                                <div
                                                    key={stop.id}
                                                    className={`order-card ${state.selectedStopId === stop.id ? 'order-card-selected' : ''} ${stop.isHotshot ? 'order-card-hotshot' : ''} ${stop.isDisabled ? 'order-card-disabled' : ''}`}
                                                    onClick={() => {
                                                        dispatch({ type: 'SELECT_STOP', payload: stop.id });
                                                        onStopSelect(stop);
                                                    }}
                                                >
                                                    <div className="order-card-header">
                                                        <span className="order-card-name">
                                                            {stop.isDisabled && <Ban size={12} style={{ marginRight: 4, opacity: 0.5 }} />}
                                                            {stop.recipientName}
                                                        </span>
                                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                            {stop.isHotshot && (
                                                                <span className="hotshot-badge" title="Hotshot - far from main cluster">
                                                                    <Flame size={12} /> Hotshot
                                                                </span>
                                                            )}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    dispatch({ type: 'TOGGLE_STOP_DISABLED', payload: stop.id });
                                                                }}
                                                                className={`btn btn-xs btn-ghost ${stop.isDisabled ? 'btn-active' : ''}`}
                                                                title={stop.isDisabled ? 'Enable stop' : 'Disable stop'}
                                                            >
                                                                {stop.isDisabled ? <EyeOff size={12} /> : <Eye size={12} />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <p className="order-card-address">{stop.fullAddress}</p>
                                                    <div className="order-card-meta">
                                                        {stop.mulchOrders.map((o, i) => (
                                                            <span
                                                                key={i}
                                                                className={`mulch-badge-sm mulch-${o.mulchType.toLowerCase().replace(/\s+/g, '-')}`}
                                                            >
                                                                {o.quantity}× {o.mulchType}
                                                            </span>
                                                        ))}
                                                        {stop.spreadingOrder && (
                                                            <span className="mulch-badge-sm mulch-spreading">
                                                                🧹 Spread {stop.spreadingOrder.quantity}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="order-card-footer">
                                                        <span className="order-card-scout">
                                                            Scout: {stop.mulchOrders[0]?.scoutName || 'Unknown'}
                                                        </span>
                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                            {/* Assign to route dropdown */}
                                                            {routes.length > 0 && !stop.isDisabled && !stop.routeId && (
                                                                <select
                                                                    className="input input-xs"
                                                                    value=""
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onChange={(e) => {
                                                                        e.stopPropagation();
                                                                        if (e.target.value) {
                                                                            dispatch({
                                                                                type: 'ASSIGN_STOP_TO_ROUTE',
                                                                                payload: { stopId: stop.id, routeId: e.target.value },
                                                                            });
                                                                        }
                                                                    }}
                                                                >
                                                                    <option value="">Assign...</option>
                                                                    {routes.map(r => (
                                                                        <option key={r.id} value={r.id}>{r.name}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                            {stop.routeId && (
                                                                <span className="route-assigned-badge" style={{ color: state.routes[stop.routeId]?.color }}>
                                                                    {state.routes[stop.routeId]?.name}
                                                                </span>
                                                            )}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onStopDetail(stop);
                                                                }}
                                                                className="btn btn-xs btn-outline"
                                                            >
                                                                Details
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                                {tab === 'routes' && (
                                    <motion.div
                                        key="routes"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                    >
                                        <RouteEditor />
                                    </motion.div>
                                )}
                                {tab === 'vehicles' && (
                                    <motion.div
                                        key="vehicles"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                    >
                                        <VehicleManager />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Collapse toggle */}
            <button onClick={onToggle} className="sidebar-toggle" title={collapsed ? 'Show sidebar' : 'Hide sidebar'}>
                {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
        </>
    );
}
