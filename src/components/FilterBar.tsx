'use client';

import { useAppState, useAppDispatch } from '@/src/lib/store';
import { X } from 'lucide-react';
import type { MulchType, VehicleType } from '@/src/lib/types';

const MULCH_TYPES: MulchType[] = ['Black', 'Aromatic Cedar', 'Fine Shredded Hardwood'];
const VEHICLE_TYPES: VehicleType[] = ['Truck', 'Trailer'];

export function FilterBar() {
    const state = useAppState();
    const dispatch = useAppDispatch();

    const { filters } = state;
    const vehicles = Object.values(state.vehicles);
    const hasActiveFilters =
        filters.mulchTypes.length > 0 ||
        filters.vehicleTypes.length > 0 ||
        filters.vehicleId !== null ||
        filters.showHotshotsOnly;

    const toggleMulchType = (type: MulchType) => {
        const current = filters.mulchTypes;
        const updated = current.includes(type)
            ? current.filter((t) => t !== type)
            : [...current, type];
        dispatch({ type: 'SET_FILTERS', payload: { mulchTypes: updated } });
    };

    const toggleVehicleType = (type: VehicleType) => {
        const current = filters.vehicleTypes;
        const updated = current.includes(type)
            ? current.filter((t) => t !== type)
            : [...current, type];
        dispatch({ type: 'SET_FILTERS', payload: { vehicleTypes: updated } });
    };

    const clearAll = () => {
        dispatch({
            type: 'SET_FILTERS',
            payload: {
                mulchTypes: [],
                vehicleTypes: [],
                vehicleId: null,
                showHotshotsOnly: false,
            },
        });
    };

    return (
        <div className="filter-bar">
            <div className="filter-group">
                <span className="filter-label">Mulch:</span>
                {MULCH_TYPES.map((type) => (
                    <button
                        key={type}
                        onClick={() => toggleMulchType(type)}
                        className={`filter-chip mulch-${type.toLowerCase().replace(/\s+/g, '-')} ${filters.mulchTypes.includes(type) ? 'filter-chip-active' : ''
                            }`}
                    >
                        {type}
                    </button>
                ))}
            </div>

            {vehicles.length > 0 && (
                <div className="filter-group">
                    <span className="filter-label">Vehicle Type:</span>
                    {VEHICLE_TYPES.map((type) => (
                        <button
                            key={type}
                            onClick={() => toggleVehicleType(type)}
                            className={`filter-chip ${filters.vehicleTypes.includes(type) ? 'filter-chip-active' : ''}`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            )}

            {vehicles.length > 0 && (
                <div className="filter-group">
                    <span className="filter-label">Vehicle:</span>
                    <select
                        value={filters.vehicleId || ''}
                        onChange={(e) =>
                            dispatch({
                                type: 'SET_FILTERS',
                                payload: { vehicleId: e.target.value || null },
                            })
                        }
                        className="filter-select"
                    >
                        <option value="">All Vehicles</option>
                        {vehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                                {v.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="filter-group">
                <button
                    onClick={() =>
                        dispatch({
                            type: 'SET_FILTERS',
                            payload: { showHotshotsOnly: !filters.showHotshotsOnly },
                        })
                    }
                    className={`filter-chip filter-chip-hotshot ${filters.showHotshotsOnly ? 'filter-chip-active' : ''}`}
                >
                    🔥 Hotshots Only
                </button>
            </div>

            {hasActiveFilters && (
                <button onClick={clearAll} className="filter-clear">
                    <X size={14} /> Clear All
                </button>
            )}
        </div>
    );
}
