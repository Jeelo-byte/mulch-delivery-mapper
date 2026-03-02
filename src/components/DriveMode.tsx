'use client';

import { useAppState, useAppDispatch } from '@/src/lib/store';
import { ChevronLeft, ChevronRight, X, Navigation2, Map } from 'lucide-react';
import { motion } from 'framer-motion';

export function DriveMode() {
    const state = useAppState();
    const dispatch = useAppDispatch();

    if (!state.isDriveMode || !state.driveModRouteId) return null;

    const route = state.routes[state.driveModRouteId];
    if (!route) return null;

    const currentStopId = route.stopIds[state.driveModeStopIndex];
    const stop = currentStopId ? state.stops[currentStopId] : null;
    const total = route.stopIds.length;

    const goNext = () => {
        if (state.driveModeStopIndex < total - 1) {
            dispatch({ type: 'SET_DRIVE_MODE_INDEX', payload: state.driveModeStopIndex + 1 });
            if (route.stopIds[state.driveModeStopIndex + 1]) {
                dispatch({ type: 'SELECT_STOP', payload: route.stopIds[state.driveModeStopIndex + 1] });
            }
        }
    };

    const goPrev = () => {
        if (state.driveModeStopIndex > 0) {
            dispatch({ type: 'SET_DRIVE_MODE_INDEX', payload: state.driveModeStopIndex - 1 });
            if (route.stopIds[state.driveModeStopIndex - 1]) {
                dispatch({ type: 'SELECT_STOP', payload: route.stopIds[state.driveModeStopIndex - 1] });
            }
        }
    };

    const openInMaps = (provider: 'google' | 'waze') => {
        if (!stop) return;
        const addr = encodeURIComponent(stop.fullAddress);
        if (provider === 'google') {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${addr}`, '_blank');
        } else {
            window.open(`https://www.waze.com/ul?q=${addr}&navigate=yes`, '_blank');
        }
    };

    return (
        <motion.div
            className="drive-mode"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
        >
            <div className="drive-mode-header">
                <span className="drive-mode-title" style={{ color: route.color }}>
                    {route.name}
                </span>
                <span className="drive-mode-progress">
                    Stop {state.driveModeStopIndex + 1} of {total}
                </span>
                <button
                    onClick={() => dispatch({ type: 'SET_DRIVE_MODE', payload: { enabled: false } })}
                    className="btn btn-ghost"
                >
                    <X size={18} />
                </button>
            </div>

            {stop && (
                <div className="drive-mode-stop">
                    <h3 className="drive-mode-name">{stop.recipientName}</h3>
                    <p className="drive-mode-address">{stop.fullAddress}</p>

                    <div className="drive-mode-meta">
                        {stop.mulchOrders.map((o, i) => (
                            <span key={i} className={`mulch-badge mulch-${o.mulchType.toLowerCase().replace(/\s+/g, '-')}`}>
                                {o.quantity}× {o.mulchType}
                            </span>
                        ))}
                    </div>

                    {stop.fulfillmentNotes && (
                        <div className="drive-mode-notes">
                            <strong>📋 Instructions:</strong>
                            <p>{stop.fulfillmentNotes}</p>
                        </div>
                    )}

                    {stop.mulchOrders.some((o) => o.placementInstructions.length > 0) && (
                        <div className="drive-mode-placement">
                            <strong>📍 Placement:</strong>
                            <p>{stop.mulchOrders.flatMap((o) => o.placementInstructions).join(', ')}</p>
                        </div>
                    )}
                </div>
            )}

            <div className="drive-mode-actions">
                <button onClick={() => openInMaps('google')} className="btn btn-nav">
                    <Map size={16} /> Google Maps
                </button>
                <button onClick={() => openInMaps('waze')} className="btn btn-nav">
                    <Navigation2 size={16} /> Waze
                </button>
            </div>

            <div className="drive-mode-nav">
                <button onClick={goPrev} disabled={state.driveModeStopIndex === 0} className="btn btn-lg">
                    <ChevronLeft size={24} /> Prev
                </button>
                <button onClick={goNext} disabled={state.driveModeStopIndex >= total - 1} className="btn btn-lg btn-primary">
                    Next <ChevronRight size={24} />
                </button>
            </div>
        </motion.div>
    );
}
