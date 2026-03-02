'use client';

import { useCallback, useState, useRef } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseCSV, aggregateStops } from '@/src/lib/csv-parser';
import { batchGeocode } from '@/src/lib/geocoder';
import { detectHotshots } from '@/src/lib/hotshot-detector';
import { useAppDispatch } from '@/src/lib/store';

interface CSVUploaderProps {
    onComplete: () => void;
}

export function CSVUploader({ onComplete }: CSVUploaderProps) {
    const dispatch = useAppDispatch();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ stage: '', percent: 0 });

    const processFile = useCallback(
        async (file: File) => {
            setIsProcessing(true);
            setProgress({ stage: 'Parsing CSV...', percent: 10 });

            try {
                const text = await file.text();
                const { raw, lineItems } = parseCSV(text);

                setProgress({ stage: 'Aggregating orders...', percent: 25 });
                await new Promise((r) => setTimeout(r, 100));
                const { stops, stopOrder } = aggregateStops(lineItems);

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
        [dispatch, onComplete]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.csv')) {
                processFile(file);
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
                            <Upload size={40} className="csv-dropzone-icon" />
                            <p className="csv-dropzone-text">
                                <strong>Click to upload</strong> or drag and drop
                            </p>
                            <p className="csv-dropzone-hint">CSV files from Square Online</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileSelect}
                                className="sr-only"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
