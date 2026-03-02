'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { ChevronUp, GripHorizontal } from 'lucide-react';

interface BottomSheetProps {
    children: React.ReactNode;
}

type SheetState = 'collapsed' | 'half' | 'full';

const COLLAPSED_HEIGHT = 60;
const HALF_HEIGHT_RATIO = 0.45;

export function BottomSheet({ children }: BottomSheetProps) {
    const [sheetState, setSheetState] = useState<SheetState>('collapsed');
    const containerRef = useRef<HTMLDivElement>(null);
    const [windowHeight, setWindowHeight] = useState(800);

    useEffect(() => {
        setWindowHeight(window.innerHeight);
        const handleResize = () => setWindowHeight(window.innerHeight);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const getHeight = (s: SheetState) => {
        switch (s) {
            case 'collapsed': return COLLAPSED_HEIGHT;
            case 'half': return windowHeight * HALF_HEIGHT_RATIO;
            case 'full': return windowHeight * 0.9;
        }
    };

    const handleDragEnd = (_: unknown, info: PanInfo) => {
        const velocity = info.velocity.y;
        const offset = info.offset.y;

        if (velocity > 500 || offset > 100) {
            // Dragged down
            if (sheetState === 'full') setSheetState('half');
            else setSheetState('collapsed');
        } else if (velocity < -500 || offset < -100) {
            // Dragged up
            if (sheetState === 'collapsed') setSheetState('half');
            else setSheetState('full');
        }
    };

    return (
        <motion.div
            ref={containerRef}
            className="bottom-sheet"
            animate={{ height: getHeight(sheetState) }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
            <motion.div
                className="bottom-sheet-handle"
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.1}
                onDragEnd={handleDragEnd}
                onClick={() => {
                    if (sheetState === 'collapsed') setSheetState('half');
                    else if (sheetState === 'half') setSheetState('full');
                    else setSheetState('collapsed');
                }}
            >
                <GripHorizontal size={24} className="bottom-sheet-grip" />
            </motion.div>
            <div className="bottom-sheet-content">{children}</div>
        </motion.div>
    );
}
