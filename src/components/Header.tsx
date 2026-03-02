'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Upload, TreePine, Settings } from 'lucide-react';
import { useAppState } from '@/src/lib/store';
import { useEffect, useState } from 'react';

interface HeaderProps {
    onUploadClick: () => void;
    onSettingsClick: () => void;
}

export function Header({ onUploadClick, onSettingsClick }: HeaderProps) {
    const { theme, setTheme } = useTheme();
    const state = useAppState();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const hasData = state.stopOrder.length > 0;
    const totalBags = Object.values(state.stops).reduce((sum, s) => sum + s.totalBags, 0);
    const totalStops = state.stopOrder.length;
    const disabledCount = Object.values(state.stops).filter(s => s.isDisabled).length;

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
                            <span className="stat-value">{totalStops}</span>
                            <span className="stat-label">Stops</span>
                        </div>
                        <div className="stat-badge">
                            <span className="stat-value">{totalBags}</span>
                            <span className="stat-label">Bags</span>
                        </div>
                        <div className="stat-badge">
                            <span className="stat-value">{Object.keys(state.routes).length}</span>
                            <span className="stat-label">Routes</span>
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
