'use client';

import { useState } from 'react';
import { X, Settings as SettingsIcon, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppState, useAppDispatch } from '@/src/lib/store';

interface SettingsModalProps {
    onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
    const state = useAppState();
    const dispatch = useAppDispatch();

    const [fuelCost, setFuelCost] = useState(state.settings.fuelCostPerMile.toString());
    const [defaultCap, setDefaultCap] = useState(state.settings.defaultCapacity.toString());
    const [depot, setDepot] = useState(state.settings.depotAddress);

    const handleSave = () => {
        dispatch({
            type: 'SET_SETTINGS',
            payload: {
                fuelCostPerMile: parseFloat(fuelCost) || 0.655,
                defaultCapacity: parseInt(defaultCap) || 50,
                depotAddress: depot,
            },
        });
        onClose();
    };

    const handleClearStorage = () => {
        if (confirm('Clear all saved data? This will reset the app on next refresh.')) {
            localStorage.removeItem('mulch-route-optimizer-state');
            onClose();
        }
    };

    // Compute stats
    const routeStats = Object.values(state.routes).map(route => {
        const vehicle = state.vehicles[route.vehicleId];
        const totalBags = route.stopIds.reduce(
            (sum, id) => sum + (state.stops[id]?.totalBags || 0), 0
        );
        const fuelCostVal = route.distanceMiles
            ? route.distanceMiles * (parseFloat(fuelCost) || 0.655)
            : null;
        return { route, vehicle, totalBags, fuelCostVal };
    });

    const totalMiles = Object.values(state.routes).reduce(
        (sum, r) => sum + (r.distanceMiles || 0), 0
    );
    const totalFuel = totalMiles * (parseFloat(fuelCost) || 0.655);

    return (
        <AnimatePresence>
            <motion.div
                className="modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    className="modal-content"
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="modal-header">
                        <div>
                            <h2 className="modal-title">
                                <SettingsIcon size={20} style={{ display: 'inline', marginRight: 8 }} />
                                Settings & Statistics
                            </h2>
                            <p className="modal-subtitle">Configure costs and view route statistics</p>
                        </div>
                        <button onClick={onClose} className="btn btn-ghost modal-close">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="modal-body">
                        {/* Settings */}
                        <div className="modal-section">
                            <h3 className="modal-section-title">Configuration</h3>
                            <div className="form-grid">
                                <div className="form-field">
                                    <label className="form-label">Fuel Cost ($/mile)</label>
                                    <input
                                        type="number" step="0.01" min="0"
                                        value={fuelCost}
                                        onChange={(e) => setFuelCost(e.target.value)}
                                        className="input"
                                        placeholder="0.655"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-label">Default Vehicle Capacity</label>
                                    <input
                                        type="number" min="1"
                                        value={defaultCap}
                                        onChange={(e) => setDefaultCap(e.target.value)}
                                        className="input"
                                        placeholder="50"
                                    />
                                </div>
                                <div className="form-field form-field-full">
                                    <label className="form-label">Depot Address (start point)</label>
                                    <input
                                        value={depot}
                                        onChange={(e) => setDepot(e.target.value)}
                                        className="input"
                                        placeholder="e.g. 123 Main St, Plano, TX 75023"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Route Statistics */}
                        {routeStats.length > 0 && (
                            <div className="modal-section">
                                <h3 className="modal-section-title">Route Statistics</h3>
                                <div className="stats-table-wrapper">
                                    <table className="stats-table">
                                        <thead>
                                            <tr>
                                                <th>Route</th>
                                                <th>Vehicle</th>
                                                <th>Stops</th>
                                                <th>Bags</th>
                                                <th>Miles</th>
                                                <th>Time</th>
                                                <th>Fuel Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {routeStats.map(({ route, vehicle, totalBags, fuelCostVal }) => (
                                                <tr key={route.id}>
                                                    <td>
                                                        <span style={{ color: route.color, fontWeight: 600 }}>
                                                            {route.name}
                                                        </span>
                                                    </td>
                                                    <td>{vehicle?.name || '—'}</td>
                                                    <td>{route.stopIds.length}</td>
                                                    <td>{totalBags}</td>
                                                    <td>
                                                        {route.distanceMiles != null
                                                            ? `${route.distanceMiles.toFixed(1)} mi`
                                                            : '—'}
                                                    </td>
                                                    <td>
                                                        {route.durationMinutes != null
                                                            ? `${Math.round(route.durationMinutes)} min`
                                                            : '—'}
                                                    </td>
                                                    <td>
                                                        {fuelCostVal != null
                                                            ? `$${fuelCostVal.toFixed(2)}`
                                                            : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan={4}><strong>Totals</strong></td>
                                                <td><strong>{totalMiles > 0 ? `${totalMiles.toFixed(1)} mi` : '—'}</strong></td>
                                                <td>—</td>
                                                <td><strong>{totalMiles > 0 ? `$${totalFuel.toFixed(2)}` : '—'}</strong></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                {totalMiles === 0 && (
                                    <p className="empty-state-sm" style={{ marginTop: 8 }}>
                                        Optimize routes (Distance or Time) to see mileage and fuel costs.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Data Management */}
                        <div className="modal-section">
                            <h3 className="modal-section-title">Data Management</h3>
                            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                                Your data is automatically saved to browser storage and persists across refreshes.
                            </p>
                            <button onClick={handleClearStorage} className="btn btn-outline btn-danger btn-sm">
                                Clear Saved Data
                            </button>
                        </div>

                        <div className="form-actions">
                            <div />
                            <button onClick={handleSave} className="btn btn-primary">
                                <Save size={14} /> Save Settings
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
