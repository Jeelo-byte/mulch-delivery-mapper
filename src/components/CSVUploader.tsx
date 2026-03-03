'use client';

import { useCallback, useState, useRef } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseCSV, aggregateStops } from '@/src/lib/csv-parser';
import { batchGeocode } from '@/src/lib/geocoder';
import { detectHotshots } from '@/src/lib/hotshot-detector';
import { useAppDispatch, useAppState } from '@/src/lib/store';

interface CSVUploaderProps {
    onComplete: () => void;
}

export function CSVUploader({ onComplete }: CSVUploaderProps) {
    const dispatch = useAppDispatch();
    const state = useAppState();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ stage: '', percent: 0 });

    const processJsonFile = useCallback(
        async (file: File) => {
            setIsProcessing(true);
            setProgress({ stage: 'Loading saved plan...', percent: 50 });
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                dispatch({ type: 'RESTORE_STATE', payload: parsed });
                setProgress({ stage: 'Complete!', percent: 100 });
                await new Promise((r) => setTimeout(r, 400));
                onComplete();
            } catch (err) {
                console.error(err);
                alert('Invalid JSON file.');
                setIsProcessing(false);
            }
        },
        [dispatch, onComplete]
    );

    const processFile = useCallback(
        async (file: File) => {
            if (file.name.endsWith('.json')) {
                return processJsonFile(file);
            }
            setIsProcessing(true);
            setProgress({ stage: 'Parsing CSV...', percent: 10 });

            try {
                const text = await file.text();
                const { raw, lineItems } = parseCSV(text);

                setProgress({ stage: 'Aggregating orders...', percent: 25 });
                await new Promise((r) => setTimeout(r, 100));
                const { stops, stopOrder } = aggregateStops(lineItems, state.settings.mulchTypes);

                dispatch({ type: 'LOAD_CSV', payload: { raw, lineItems, stops, stopOrder } });

                // Geocode addresses
                setProgress({ stage: 'Geocoding addresses...', percent: 35 });
                const addressList = Object.values(stops).map((s) => ({
                    id: s.id,
                    address: s.fullAddress,
                }));

                const coords = await batchGeocode(addressList, (completed, total) => {
                    const pct = 35 + Math.round((completed / total) * 50);
                    setProgress({ stage: `Geocoding... ${completed}/${total}`, percent: pct });
                });

                // Set coordinates
                for (const [stopId, coordinates] of coords) {
                    dispatch({ type: 'SET_COORDINATES', payload: { stopId, coordinates } });
                    stops[stopId].coordinates = coordinates;
                }

                // Detect hotshots
                setProgress({ stage: 'Detecting hotshots...', percent: 90 });
                const hotshots = detectHotshots(Object.values(stops));
                for (const stopId of hotshots) {
                    dispatch({ type: 'SET_HOTSHOT', payload: { stopId, isHotshot: true } });
                }

                setProgress({ stage: 'Complete!', percent: 100 });
                await new Promise((r) => setTimeout(r, 400));
                onComplete();
            } catch (error) {
                console.error('Error processing CSV:', error);
                setProgress({ stage: 'Error processing file', percent: 0 });
                setIsProcessing(false);
            }
        },
        [dispatch, onComplete, processJsonFile, state.settings.mulchTypes]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) {
                if (file.name.endsWith('.csv') || file.name.endsWith('.json')) {
                    processFile(file);
                } else {
                    alert('Please upload a CSV or JSON file.');
                }
            }
        },
        [processFile]
    );

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
        },
        [processFile]
    );

    const handleJsonSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) processJsonFile(file);
        },
        [processJsonFile]
    );

    return (
        <div className="csv-uploader-wrapper">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="csv-uploader-card"
            >
                <div className="csv-uploader-header">
                    <div className="csv-uploader-icon-wrapper">
                        <FileText size={32} />
                    </div>
                    <h2 className="csv-uploader-title">Import Delivery Orders</h2>
                    <p className="csv-uploader-desc">
                        Upload your Square Online CSV export to begin building delivery routes
                    </p>
                </div>

                <AnimatePresence mode="wait">
                    {isProcessing ? (
                        <motion.div
                            key="processing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="csv-progress"
                        >
                            <div className="csv-progress-bar-track">
                                <motion.div
                                    className="csv-progress-bar-fill"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress.percent}%` }}
                                    transition={{ duration: 0.3 }}
                                />
                            </div>
                            <div className="csv-progress-text">
                                <Loader2 size={16} className="spinner" />
                                <span>{progress.stage}</span>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="dropzone"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`csv-dropzone ${isDragging ? 'csv-dropzone-active' : ''}`}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="csv-dropzone-actions" style={{ display: 'flex', gap: '2rem', justifyContent: 'center' }}>
                                <div
                                    className="upload-option"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        fileInputRef.current?.click();
                                    }}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '1rem', borderRadius: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                                >
                                    <Upload size={40} className="csv-dropzone-icon" />
                                    <p className="csv-dropzone-text" style={{ marginTop: '0.5rem' }}>
                                        <strong>Upload CSV</strong>
                                    </p>
                                    <p className="csv-dropzone-hint">Square Online Export</p>
                                </div>
                                <div
                                    className="upload-option"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        jsonInputRef.current?.click();
                                    }}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '1rem', borderRadius: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                                >
                                    <Upload size={40} className="csv-dropzone-icon" />
                                    <p className="csv-dropzone-text" style={{ marginTop: '0.5rem' }}>
                                        <strong>Upload JSON</strong>
                                    </p>
                                    <p className="csv-dropzone-hint">Saved Route Plan</p>
                                </div>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.json,application/json"
                                onChange={handleFileSelect}
                                className="sr-only"
                            />
                            <input
                                ref={jsonInputRef}
                                type="file"
                                accept=".json,application/json"
                                onChange={handleJsonSelect}
                                className="sr-only"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
