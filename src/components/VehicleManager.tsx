'use client';

import { useState } from 'react';
import { useAppState, useAppDispatch } from '@/src/lib/store';
import { Plus, Trash2, Edit2, Check, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Vehicle, VehicleType } from '@/src/lib/types';

const ROUTE_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

export function VehicleManager() {
    const state = useAppState();
    const dispatch = useAppDispatch();
    const [isAdding, setIsAdding] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [type, setType] = useState<VehicleType>('Trailer');
    const [capacity, setCapacity] = useState(100);

    const vehicles = Object.values(state.vehicles);

    const handleAdd = () => {
        if (!name.trim()) return;
        const id = `vehicle-${Date.now()}`;
        const vehicle: Vehicle = { id, name: name.trim(), type, capacity };
        dispatch({ type: 'ADD_VEHICLE', payload: vehicle });

        // Auto-create a route for this vehicle
        const routeIdx = Object.keys(state.routes).length;
        const color = ROUTE_COLORS[routeIdx % ROUTE_COLORS.length];
        dispatch({
            type: 'CREATE_ROUTE',
            payload: {
                id: `route-${Date.now()}`,
                name: `${name.trim()} Route`,
                vehicleId: id,
                mulchType: null,
                stopIds: [],
                color,
                visible: true,
                optimized: false,
                routeGeometry: null,
                distanceMiles: null,
                durationMinutes: null,
            },
        });

        setName('');
        setType('Trailer');
        setCapacity(100);
        setIsAdding(false);
    };

    const handleUpdate = () => {
        if (!editId || !name.trim()) return;
        dispatch({ type: 'UPDATE_VEHICLE', payload: { id: editId, name: name.trim(), type, capacity } });
        setEditId(null);
        setName('');
    };

    const startEdit = (v: Vehicle) => {
        setEditId(v.id);
        setName(v.name);
        setType(v.type);
        setCapacity(v.capacity);
        setIsAdding(false);
    };

    return (
        <div className="vehicle-manager">
            <div className="section-header">
                <h3 className="section-title">
                    <Truck size={16} /> Vehicles
                </h3>
                <button onClick={() => { setIsAdding(true); setEditId(null); setName(''); }} className="btn btn-sm btn-primary">
                    <Plus size={14} /> Add
                </button>
            </div>

            <AnimatePresence>
                {(isAdding || editId) && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="vehicle-form"
                    >
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Vehicle name..."
                            className="input"
                            autoFocus
                        />
                        <div className="vehicle-form-row">
                            <select value={type} onChange={(e) => setType(e.target.value as VehicleType)} className="input">
                                <option value="Trailer">Trailer</option>
                                <option value="Truck">Truck</option>
                            </select>
                            <input
                                type="number"
                                value={capacity}
                                onChange={(e) => setCapacity(parseInt(e.target.value) || 0)}
                                placeholder="Capacity"
                                className="input"
                                min={1}
                            />
                        </div>
                        <div className="vehicle-form-actions">
                            <button onClick={editId ? handleUpdate : handleAdd} className="btn btn-sm btn-primary">
                                <Check size={14} /> {editId ? 'Update' : 'Add'}
                            </button>
                            <button onClick={() => { setIsAdding(false); setEditId(null); }} className="btn btn-sm btn-ghost">
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="vehicle-list">
                {vehicles.map((v) => {
                    const route = Object.values(state.routes).find((r) => r.vehicleId === v.id);
                    const usedCapacity = route
                        ? route.stopIds.reduce((sum, id) => sum + (state.stops[id]?.totalBags || 0), 0)
                        : 0;
                    const usagePct = Math.round((usedCapacity / v.capacity) * 100);

                    return (
                        <motion.div key={v.id} layout className="vehicle-card">
                            <div className="vehicle-card-header">
                                <div className="vehicle-info">
                                    <span className="vehicle-name">{v.name}</span>
                                    <span className="vehicle-type-badge">{v.type}</span>
                                </div>
                                <div className="vehicle-actions">
                                    <button onClick={() => startEdit(v)} className="btn btn-xs btn-ghost">
                                        <Edit2 size={12} />
                                    </button>
                                    <button
                                        onClick={() => dispatch({ type: 'REMOVE_VEHICLE', payload: v.id })}
                                        className="btn btn-xs btn-ghost btn-danger"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                            <div className="vehicle-capacity">
                                <div className="capacity-bar-track">
                                    <div
                                        className={`capacity-bar-fill ${usagePct > 90 ? 'capacity-danger' : usagePct > 70 ? 'capacity-warn' : ''}`}
                                        style={{ width: `${Math.min(usagePct, 100)}%` }}
                                    />
                                </div>
                                <span className="capacity-text">{usedCapacity}/{v.capacity} bags</span>
                            </div>
                            {route?.mulchType && (
                                <span className={`mulch-badge-sm mulch-${route.mulchType.toLowerCase().replace(/\s+/g, '-')}`}>
                                    {route.mulchType}
                                </span>
                            )}
                        </motion.div>
                    );
                })}
                {vehicles.length === 0 && (
                    <p className="empty-state">No vehicles added yet. Add a vehicle to start building routes.</p>
                )}
            </div>
        </div>
    );
}
