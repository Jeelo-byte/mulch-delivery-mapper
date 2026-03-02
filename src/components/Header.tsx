'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Upload, TreePine, Settings, Download, UploadCloud, Share2 } from 'lucide-react';
import { useAppState, useAppDispatch } from '@/src/lib/store';
import { useEffect, useState, useRef } from 'react';
import LZString from 'lz-string';

interface HeaderProps {
    onUploadClick: () => void;
    onSettingsClick: () => void;
}

export function Header({ onUploadClick, onSettingsClick }: HeaderProps) {
    const { theme, setTheme } = useTheme();
    const state = useAppState();
    const dispatch = useAppDispatch();
    const [mounted, setMounted] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => setMounted(true), []);

    const hasData = state.stopOrder.length > 0;
    const disabledCount = Object.values(state.stops).filter(s => s.isDisabled).length;

    let bagsDelivered = 0;
    let bagsSpread = 0;
    Object.values(state.stops).forEach(stop => {
        if (!stop.isDisabled && stop.routeId) {
            bagsDelivered += stop.mulchOrders.reduce((sum, o) => sum + o.quantity, 0);
            bagsSpread += (stop.spreadingOrder?.quantity || 0);
        }
    });
    const totalMiles = Object.values(state.routes).reduce((sum, r) => sum + (r.distanceMiles || 0), 0);
    const unassignedStops = Object.values(state.stops).filter(s => !s.isDisabled && !s.routeId).length;

    const handleExportJSON = () => {
        const dataStr = JSON.stringify({
            rawCSVData: state.rawCSVData,
            lineItems: state.lineItems,
            stops: state.stops,
            stopOrder: state.stopOrder,
            vehicles: state.vehicles,
            routes: state.routes,
            settings: state.settings,
        }, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mulch-routes-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target?.result as string);
                dispatch({ type: 'RESTORE_STATE', payload: parsed });
            } catch (err) {
                alert('Invalid JSON file.');
            }
        };
        reader.readAsText(file);
    };

    const [isSharing, setIsSharing] = useState(false);

    const handleShareLink = () => {
        setIsSharing(true);
        // Use a small timeout to let React render the loading state before blocking
        setTimeout(() => {
            try {
                const shareData = {
                    stops: state.stops,
                    routes: state.routes,
                    vehicles: state.vehicles,
                    stopOrder: state.stopOrder,
                    settings: state.settings,
                };
                const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(shareData));
                const url = `${window.location.origin}${window.location.pathname}?share=${compressed}`;
                navigator.clipboard.writeText(url);
                alert('Share link copied to clipboard!');
            } catch (err) {
                console.error(err);
                alert('Error generating share link');
            } finally {
                setIsSharing(false);
            }
        }, 50);
    };

    return (
        <header className="header">
            <div className="header-left">
                <div className="header-logo">
                    <TreePine className="header-logo-icon" />
                    <div>
                        <h1 className="header-title">Mulch Route Optimizer</h1>
                        <p className="header-subtitle">Scouting Fundraiser Delivery Manager</p>
                    </div>
                </div>
            </div>

            <div className="header-center">
                {hasData && (
                    <div className="header-stats">
                        <div className="stat-badge">
                            <span className="stat-value">{bagsDelivered}</span>
                            <span className="stat-label">Delivered</span>
                        </div>
                        <div className="stat-badge">
                            <span className="stat-value">{bagsSpread}</span>
                            <span className="stat-label">Spread</span>
                        </div>
                        <div className="stat-badge">
                            <span className="stat-value">{totalMiles.toFixed(1)}</span>
                            <span className="stat-label">Miles</span>
                        </div>
                        <div className="stat-badge" style={{ borderColor: unassignedStops > 0 ? 'var(--color-danger)' : undefined }}>
                            <span className="stat-value" style={{ color: unassignedStops > 0 ? 'var(--color-danger)' : undefined }}>{unassignedStops}</span>
                            <span className="stat-label">Unassigned</span>
                        </div>
                        {disabledCount > 0 && (
                            <div className="stat-badge stat-badge-muted">
                                <span className="stat-value">{disabledCount}</span>
                                <span className="stat-label">Disabled</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="header-right">
                {hasData && (
                    <>
                        <button onClick={handleShareLink} className="btn btn-ghost" title="Share Route Plan" disabled={isSharing}>
                            {isSharing ? <span className="spinner" style={{ display: 'inline-block', width: 18, height: 18, border: '2px solid var(--text-muted)', borderTopColor: 'var(--text-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : <Share2 size={18} />}
                        </button>
                        <button onClick={handleExportJSON} className="btn btn-ghost" title="Export JSON">
                            <Download size={18} />
                        </button>
                        <button onClick={onSettingsClick} className="btn btn-ghost" title="Settings & Statistics">
                            <Settings size={18} />
                        </button>
                        <button onClick={onUploadClick} className="btn btn-ghost" title="Upload new CSV">
                            <Upload size={18} />
                        </button>
                    </>
                )}
                {mounted && (
                    <button
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        className="btn btn-ghost"
                        title="Toggle theme"
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                )}
            </div>
        </header>
    );
}
