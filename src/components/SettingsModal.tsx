'use client';

import { useState } from 'react';
import { X, Settings as SettingsIcon, Save, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppState, useAppDispatch } from '@/src/lib/store';
import { geocodeAddress } from '@/src/lib/geocoder';

interface SettingsModalProps {
    onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
    const state = useAppState();
    const dispatch = useAppDispatch();

    const [depot, setDepot] = useState(state.settings.depotAddress);
    const [geocodingDepot, setGeocodingDepot] = useState(false);
    const [geocodeError, setGeocodeError] = useState('');

    const [enforceWeightLimits, setEnforceWeightLimits] = useState(state.settings.enforceWeightLimits);
    const [laborTime, setLaborTime] = useState(state.settings.laborTimePerSpreadBag.toString());
    const [deliveryBagTime, setDeliveryBagTime] = useState(state.settings.timeSpentPerDeliveryBag.toString());
    const [generationMode, setGenerationMode] = useState(state.settings.routeGenerationMode);

    // Two distinct start times + dates
    const todayISO = new Date().toISOString().split('T')[0];
    const [deliveryStart, setDeliveryStart] = useState(state.settings.deliveryStartTime || '08:00');
    const [spreadingStart, setSpreadingStart] = useState(state.settings.spreadingStartTime || '09:00');
    const [deliveryDate, setDeliveryDate] = useState(state.settings.deliveryDate || todayISO);
    const [spreadingDate, setSpreadingDate] = useState(state.settings.spreadingDate || todayISO);
    const [lunchStart, setLunchStart] = useState(state.settings.lunchBreakStartTime || '12:00');
    const [lunchDuration, setLunchDuration] = useState((state.settings.lunchBreakDuration || 30).toString());

    // Map Styling
    const [mapLineThickness, setMapLineThickness] = useState((state.settings.mapLineThickness || 4).toString());
    const [mapSelectedLineThickness, setMapSelectedLineThickness] = useState((state.settings.mapSelectedLineThickness || 6).toString());
    const [mapPinScale, setMapPinScale] = useState((state.settings.mapPinScale || 1.0).toString());
    const [mapLabelTextSize, setMapLabelTextSize] = useState((state.settings.mapLabelTextSize || 12).toString());

    // Custom Types
    const [mulchTypesStr, setMulchTypesStr] = useState((state.settings.mulchTypes || []).join(', '));
    const [vehicleTypesStr, setVehicleTypesStr] = useState((state.settings.vehicleTypes || []).join(', '));

    const syncDates = () => setSpreadingDate(deliveryDate);

    const handleSave = async () => {
        setGeocodeError('');
        let depotCoords = state.settings.depotCoords;

        // Re-geocode if the depot address changed
        if (depot.trim() && depot.trim() !== state.settings.depotAddress.trim()) {
            setGeocodingDepot(true);
            try {
                const coords = await geocodeAddress(depot.trim());
                depotCoords = coords;
                if (!coords) {
                    setGeocodeError('Could not geocode depot address. Check the address and try again.');
                }
            } catch {
                setGeocodeError('Geocoding failed. Please verify the address.');
            } finally {
                setGeocodingDepot(false);
            }
        } else if (!depot.trim()) {
            depotCoords = null;
        }

        dispatch({
            type: 'SET_SETTINGS',
            payload: {
                depotAddress: depot,
                depotCoords,
                enforceWeightLimits,
                laborTimePerSpreadBag: parseFloat(laborTime) || (laborTime === '0' ? 0 : 3),
                timeSpentPerDeliveryBag: parseFloat(deliveryBagTime) || (deliveryBagTime === '0' ? 0 : 2),
                routeGenerationMode: generationMode,
                deliveryStartTime: deliveryStart,
                spreadingStartTime: spreadingStart,
                deliveryDate,
                spreadingDate,
                lunchBreakStartTime: lunchStart,
                lunchBreakDuration: parseInt(lunchDuration) || 30,
                mapLineThickness: parseInt(mapLineThickness) || 4,
                mapSelectedLineThickness: parseInt(mapSelectedLineThickness) || 6,
                mapPinScale: parseFloat(mapPinScale) || 1.0,
                mapLabelTextSize: parseInt(mapLabelTextSize) || 12,
                mulchTypes: mulchTypesStr.split(',').map(s => s.trim()).filter(Boolean),
                vehicleTypes: vehicleTypesStr.split(',').map(s => s.trim()).filter(Boolean),
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

    // Compute stats — use per-vehicle fuel cost
    const routeStats = Object.values(state.routes).map(route => {
        const vehicle = state.vehicles[route.vehicleId];
        const totalBags = route.stopIds.reduce((sum, id) => {
            const stop = state.stops[id];
            if (!stop) return sum;
            return sum + (route.serviceMode === 'spreading' ? (stop.spreadingOrder?.quantity || 0) : stop.totalBags);
        }, 0);
        const vehicleFuelRate = vehicle?.fuelCostPerMile ?? 0;
        const fuelCostVal = route.distanceMiles && vehicleFuelRate > 0
            ? route.distanceMiles * vehicleFuelRate
            : null;
        return { route, vehicle, totalBags, fuelCostVal, vehicleFuelRate };
    });

    const totalMiles = Object.values(state.routes).reduce(
        (sum, r) => sum + (r.distanceMiles || 0), 0
    );
    const totalFuel = routeStats.reduce((sum, s) => sum + (s.fuelCostVal || 0), 0);

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
                                Settings &amp; Statistics
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
                                    <label className="form-label">Labor Time per Spread Bag (mins)</label>
                                    <input
                                        type="number" min="0" step="any"
                                        value={laborTime}
                                        onChange={(e) => setLaborTime(e.target.value)}
                                        className="input"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-label">Time Spent per Delivery Bag (mins)</label>
                                    <input
                                        type="number" min="0" step="any"
                                        value={deliveryBagTime}
                                        onChange={(e) => setDeliveryBagTime(e.target.value)}
                                        className="input"
                                        placeholder="2"
                                        title="Minutes per bag to unload at each delivery stop"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-label">Route Generation Mode</label>
                                    <select
                                        value={generationMode}
                                        onChange={(e) => setGenerationMode(e.target.value as 'Geographic' | 'By Scout' | 'Spreading Only')}
                                        className="input"
                                    >
                                        <option value="Geographic">Geographic Clustering</option>
                                        <option value="By Scout">By Scout to Credit</option>
                                        <option value="Spreading Only">Spreading Only</option>
                                    </select>
                                </div>

                                {/* Depot address — full width */}
                                <div className="form-field form-field-full">
                                    <label className="form-label">
                                        <MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />
                                        Depot Address (Start &amp; End Point for all routes)
                                    </label>
                                    <input
                                        value={depot}
                                        onChange={(e) => { setDepot(e.target.value); setGeocodeError(''); }}
                                        className="input"
                                        placeholder="e.g. 123 Main St, Plano, TX 75023"
                                    />
                                    {geocodeError && (
                                        <p style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 4 }}>{geocodeError}</p>
                                    )}
                                    {state.settings.depotCoords && depot === state.settings.depotAddress && (
                                        <p style={{ color: 'var(--color-success, #22c55e)', fontSize: 11, marginTop: 4 }}>
                                            ✓ Geocoded: [{state.settings.depotCoords[1].toFixed(4)}, {state.settings.depotCoords[0].toFixed(4)}]
                                        </p>
                                    )}
                                </div>

                                <div className="form-field form-field-full" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={enforceWeightLimits}
                                        onChange={(e) => setEnforceWeightLimits(e.target.checked)}
                                        id="enforceWeight"
                                    />
                                    <label htmlFor="enforceWeight" className="form-label" style={{ marginBottom: 0 }}>Enforce Vehicle Weight Limits</label>
                                </div>
                            </div>

                            {/* Timing section */}
                            <h4 className="modal-section-title" style={{ marginTop: 20, fontSize: 13 }}>⏱ Schedule Timing</h4>
                            <div className="form-grid">
                                {/* Delivery date + time */}
                                <div className="form-field">
                                    <label className="form-label">🚛 Delivery Date</label>
                                    <input
                                        type="date"
                                        value={deliveryDate}
                                        onChange={(e) => setDeliveryDate(e.target.value)}
                                        className="input"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-label">🚛 Delivery Start Time</label>
                                    <input
                                        type="time"
                                        value={deliveryStart}
                                        onChange={(e) => setDeliveryStart(e.target.value)}
                                        className="input"
                                    />
                                </div>

                                {/* Spreading date + time */}
                                <div className="form-field">
                                    <label className="form-label">
                                        🌱 Spreading Date
                                        <button
                                            type="button"
                                            onClick={syncDates}
                                            className="btn btn-xs btn-ghost"
                                            style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px' }}
                                            title="Set same day as delivery"
                                        >
                                            Same Day
                                        </button>
                                    </label>
                                    <input
                                        type="date"
                                        value={spreadingDate}
                                        onChange={(e) => setSpreadingDate(e.target.value)}
                                        className="input"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-label">🌱 Spreading Start Time</label>
                                    <input
                                        type="time"
                                        value={spreadingStart}
                                        onChange={(e) => setSpreadingStart(e.target.value)}
                                        className="input"
                                    />
                                </div>

                                {/* Lunch break */}
                                <div className="form-field">
                                    <label className="form-label">🍽️ Lunch Break Start</label>
                                    <input
                                        type="time"
                                        value={lunchStart}
                                        onChange={(e) => setLunchStart(e.target.value)}
                                        className="input"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-label">Lunch Duration (mins)</label>
                                    <input
                                        type="number" min="0"
                                        value={lunchDuration}
                                        onChange={(e) => setLunchDuration(e.target.value)}
                                        className="input"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Custom Types */}
                        <div className="modal-section">
                            <h3 className="modal-section-title">Custom Types</h3>
                            <div className="form-grid">
                                <div className="form-field form-field-full">
                                    <label className="form-label">Mulch Types (comma-separated)</label>
                                    <input
                                        value={mulchTypesStr}
                                        onChange={(e) => setMulchTypesStr(e.target.value)}
                                        className="input"
                                        placeholder="Black, Brown, Red..."
                                    />
                                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                        Make sure these perfectly match the &quot;Item Variation&quot; names from your CSV.
                                    </p>
                                </div>
                                <div className="form-field form-field-full">
                                    <label className="form-label">Vehicle Types (comma-separated)</label>
                                    <input
                                        value={vehicleTypesStr}
                                        onChange={(e) => setVehicleTypesStr(e.target.value)}
                                        className="input"
                                        placeholder="Truck, Trailer, Van..."
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Map Aesthetics */}
                        <div className="modal-section">
                            <h3 className="modal-section-title">Map Styling Customization</h3>
                            <div className="form-grid">
                                <div className="form-field">
                                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        Base Line Thickness <span>{mapLineThickness}px</span>
                                    </label>
                                    <input
                                        type="range" min="2" max="12" step="1"
                                        value={mapLineThickness}
                                        onChange={(e) => setMapLineThickness(e.target.value)}
                                        className="input"
                                        style={{ padding: 0 }}
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        Selected Line Thickness <span>{mapSelectedLineThickness}px</span>
                                    </label>
                                    <input
                                        type="range" min="2" max="16" step="1"
                                        value={mapSelectedLineThickness}
                                        onChange={(e) => setMapSelectedLineThickness(e.target.value)}
                                        className="input"
                                        style={{ padding: 0 }}
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        Map Pin Size <span>{mapPinScale}x</span>
                                    </label>
                                    <input
                                        type="range" min="0.5" max="2.0" step="0.1"
                                        value={mapPinScale}
                                        onChange={(e) => setMapPinScale(e.target.value)}
                                        className="input"
                                        style={{ padding: 0 }}
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        Route Text Size <span>{mapLabelTextSize}px</span>
                                    </label>
                                    <input
                                        type="range" min="8" max="24" step="1"
                                        value={mapLabelTextSize}
                                        onChange={(e) => setMapLabelTextSize(e.target.value)}
                                        className="input"
                                        style={{ padding: 0 }}
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
                                                <th>Drive Time</th>
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
                            <button onClick={handleSave} className="btn btn-primary" disabled={geocodingDepot}>
                                {geocodingDepot ? (
                                    <><MapPin size={14} /> Geocoding…</>
                                ) : (
                                    <><Save size={14} /> Save Settings</>
                                )}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
