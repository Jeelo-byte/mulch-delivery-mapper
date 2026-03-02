'use client';

import { useState, useEffect } from 'react';
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
    const [maxBagCapacity, setMaxBagCapacity] = useState(80);
    const [maxWeightLimit, setMaxWeightLimit] = useState(2000);
    const [fuelCostPerMile, setFuelCostPerMile] = useState(1.1);
    const [generationCount, setGenerationCount] = useState(1);

    useEffect(() => {
        if (state.activeServiceMode === 'spreading') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setType('Car');
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMaxBagCapacity(9999);
        } else {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setType('Trailer');
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMaxBagCapacity(80);
        }
    }, [state.activeServiceMode]);

    const vehicles = Object.values(state.vehicles).filter(v => v.serviceMode === state.activeServiceMode);

    const handleAdd = () => {
        if (!name.trim()) return;

        const baseName = name.trim();
        for (let i = 0; i < generationCount; i++) {
            const id = `vehicle-${Date.now()}-${i}`;
            const vName = generationCount > 1 ? `${baseName} ${i + 1}` : baseName;
            const vehicle: Vehicle = {
                id,
                name: vName,
                type,
                maxBagCapacity,
                maxWeightLimit,
                fuelCostPerMile,
                serviceMode: state.activeServiceMode
            };
            dispatch({ type: 'ADD_VEHICLE', payload: vehicle });
        }

        setName('');
        setName('');
        if (state.activeServiceMode === 'spreading') {
            setType('Car');
            setMaxBagCapacity(9999);
        } else {
            setType('Trailer');
            setMaxBagCapacity(80);
        }
        setMaxWeightLimit(2000);
        setFuelCostPerMile(1.1);
        setGenerationCount(1);
        setIsAdding(false);
    };

    const handleUpdate = () => {
        if (!editId || !name.trim()) return;

        const existingVehicle = state.vehicles[editId];
        if (!existingVehicle) return;

        dispatch({
            type: 'UPDATE_VEHICLE',
            payload: {
                id: editId,
                name: name.trim(),
                type,
                maxBagCapacity,
                maxWeightLimit,
                fuelCostPerMile,
                serviceMode: existingVehicle.serviceMode
            }
        });
        setEditId(null);
        setName('');
    };

    const startEdit = (v: Vehicle) => {
        setEditId(v.id);
        setName(v.name);
        setType(v.type);
        setMaxBagCapacity(v.maxBagCapacity);
        setMaxWeightLimit(v.maxWeightLimit);
        setFuelCostPerMile(v.fuelCostPerMile ?? 1.1);
        setGenerationCount(1);
        setIsAdding(false);
    };

    const handleTypeChange = (newType: VehicleType) => {
        setType(newType);
        if (newType === 'Truck') setMaxBagCapacity(200);
        if (newType === 'Trailer') setMaxBagCapacity(80);
        if (newType === 'Car') setMaxBagCapacity(9999);
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
                        <div className="form-field" style={{ marginBottom: 8, width: '100%' }}>
                            <label className="form-label">Vehicle Name</label>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Vehicle name..."
                                className="input"
                                autoFocus
                            />
                        </div>
                        <div className="vehicle-form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', alignItems: 'end' }}>
                            <div className="form-field">
                                <label className="form-label">Type</label>
                                <select value={type} onChange={(e) => handleTypeChange(e.target.value as VehicleType)} className="input">
                                    {state.activeServiceMode === 'mulch' ? (
                                        <>
                                            <option value="Trailer">Trailer</option>
                                            <option value="Truck">Truck</option>
                                        </>
                                    ) : (
                                        <option value="Car">Car</option>
                                    )}
                                </select>
                            </div>
                            {state.activeServiceMode === 'mulch' && (
                                <div className="form-field">
                                    <label className="form-label">Capacity (Bags)</label>
                                    <input
                                        type="number"
                                        value={maxBagCapacity}
                                        onChange={(e) => setMaxBagCapacity(parseInt(e.target.value) || 0)}
                                        placeholder="Bag Capacity"
                                        className="input"
                                        min={1}
                                    />
                                </div>
                            )}
                            <div className="form-field">
                                <label className="form-label">Fuel Cost ($/mi)</label>
                                <input
                                    type="number" step="0.01" min="0"
                                    value={fuelCostPerMile}
                                    onChange={(e) => setFuelCostPerMile(parseFloat(e.target.value) || 1.1)}
                                    placeholder="1.10"
                                    className="input"
                                />
                            </div>
                            <div className="form-field">
                                <label className="form-label">Weight Limit</label>
                                <div className="input" style={{ opacity: 0.6, cursor: 'not-allowed', backgroundColor: 'var(--surface)' }}>n/a</div>
                            </div>
                            {!editId && (
                                <div className="form-field">
                                    <label className="form-label">Count (Batch)</label>
                                    <input
                                        type="number" min="1" max="20"
                                        value={generationCount}
                                        onChange={(e) => setGenerationCount(parseInt(e.target.value) || 1)}
                                        className="input"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="vehicle-form-actions" style={{ marginTop: '12px' }}>
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
                    const usagePct = Math.round((usedCapacity / v.maxBagCapacity) * 100);

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
                                {state.activeServiceMode === 'mulch' ? (
                                    <>
                                        <div className="capacity-bar-track">
                                            <div
                                                className={`capacity-bar-fill ${usagePct > 90 ? 'capacity-danger' : usagePct > 70 ? 'capacity-warn' : ''}`}
                                                style={{ width: `${Math.min(usagePct, 100)}%` }}
                                            />
                                        </div>
                                        <span className="capacity-text">{usedCapacity}/{v.maxBagCapacity} bags</span>
                                    </>
                                ) : (
                                    <span className="capacity-text">Spreading Vehicle</span>
                                )}
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
