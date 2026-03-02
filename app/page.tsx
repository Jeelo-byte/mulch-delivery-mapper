'use client';

import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Header } from '@/src/components/Header';
import { CSVUploader } from '@/src/components/CSVUploader';
import { MapView } from '@/src/components/MapView';
import { Sidebar } from '@/src/components/Sidebar';
import { FilterBar } from '@/src/components/FilterBar';
import { OrderDetailModal } from '@/src/components/OrderDetailModal';
import { DriveMode } from '@/src/components/DriveMode';
import { BottomSheet } from '@/src/components/BottomSheet';
import { AddStopForm } from '@/src/components/AddStopForm';
import { SettingsModal } from '@/src/components/SettingsModal';
import { useAppState } from '@/src/lib/store';
import type { DeliveryStop } from '@/src/lib/types';

export default function Home() {
  const state = useAppState();
  const [showUploader, setShowUploader] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailStop, setDetailStop] = useState<DeliveryStop | null>(null);
  const [showAddStop, setShowAddStop] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMobile(window.innerWidth < 768);
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const handleUploadComplete = useCallback(() => {
    setShowUploader(false);
  }, []);

  const handleStopSelect = useCallback(() => {
    // Stop selection handled by store
  }, []);

  const handleStopDetail = useCallback((stop: DeliveryStop) => {
    setDetailStop(stop);
  }, []);

  const hasData = state.stopOrder.length > 0;

  // Show uploader if no data and never uploaded, or user requested
  if (!hasData && !showUploader) {
    // Check if we just haven't loaded from storage yet — brief delay
    return (
      <div className="app-layout">
        <Header onUploadClick={() => setShowUploader(true)} onSettingsClick={() => setShowSettings(true)} />
        <CSVUploader onComplete={handleUploadComplete} />
      </div>
    );
  }

  if (showUploader) {
    return (
      <div className="app-layout">
        <Header onUploadClick={() => setShowUploader(true)} onSettingsClick={() => setShowSettings(true)} />
        <CSVUploader onComplete={handleUploadComplete} />
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Header onUploadClick={() => setShowUploader(true)} onSettingsClick={() => setShowSettings(true)} />
      <FilterBar />

      <div className="app-main">
        {/* Desktop/Tablet sidebar */}
        {!isMobile && (
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            onStopSelect={handleStopSelect}
            onStopDetail={handleStopDetail}
            onAddStop={() => setShowAddStop(true)}
          />
        )}

        {/* Map */}
        <MapView onStopClick={handleStopSelect} onStopDetail={handleStopDetail} />

        {/* Mobile bottom sheet */}
        {isMobile && (
          <BottomSheet>
            <Sidebar
              collapsed={false}
              onToggle={() => { }}
              onStopSelect={handleStopSelect}
              onStopDetail={handleStopDetail}
              onAddStop={() => setShowAddStop(true)}
            />
          </BottomSheet>
        )}
      </div>

      {/* Drive mode overlay */}
      <AnimatePresence>
        {state.isDriveMode && <DriveMode />}
      </AnimatePresence>

      {/* Order detail modal */}
      <OrderDetailModal stop={detailStop} onClose={() => setDetailStop(null)} />

      {/* Add stop modal */}
      <AnimatePresence>
        {showAddStop && <AddStopForm onClose={() => setShowAddStop(false)} />}
      </AnimatePresence>

      {/* Settings modal */}
      <AnimatePresence>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </AnimatePresence>
    </div>
  );
}
