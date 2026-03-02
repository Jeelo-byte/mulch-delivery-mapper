'use client';

import { useState } from 'react';
import { useAppDispatch } from '@/src/lib/store';
import { geocodeAddress } from '@/src/lib/geocoder';
import { Plus, X, MapPin, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DeliveryStop, MulchType, MulchOrder } from '@/src/lib/types';

const MULCH_TYPES: MulchType[] = ['Black', 'Aromatic Cedar', 'Fine Shredded Hardwood'];

interface AddStopFormProps {
    onClose: () => void;
}

export function AddStopForm({ onClose }: AddStopFormProps) {
    const dispatch = useAppDispatch();
    const [saving, setSaving] = useState(false);

    // Form state matching CSV fields
    const [recipientName, setRecipientName] = useState('');
    const [recipientEmail, setRecipientEmail] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [address, setAddress] = useState('');
    const [address2, setAddress2] = useState('');
    const [city, setCity] = useState('');
    const [region, setRegion] = useState('TX');
    const [postalCode, setPostalCode] = useState('');
    const [fulfillmentNotes, setFulfillmentNotes] = useState('');
    const [orderId, setOrderId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);

    // Mulch orders (multiple items)
    const [mulchOrders, setMulchOrders] = useState<{ mulchType: MulchType; quantity: number; scoutName: string; placement: string }[]>([
        { mulchType: 'Black', quantity: 1, scoutName: '', placement: '' },
    ]);

    const addMulchOrder = () => {
        setMulchOrders([...mulchOrders, { mulchType: 'Black', quantity: 1, scoutName: '', placement: '' }]);
    };

    const removeMulchOrder = (index: number) => {
        setMulchOrders(mulchOrders.filter((_, i) => i !== index));
    };

    const updateMulchOrder = (index: number, field: string, value: string | number) => {
        const updated = [...mulchOrders];
        updated[index] = { ...updated[index], [field]: value };
        setMulchOrders(updated);
    };

    const handleSave = async () => {
        if (!recipientName || !address || !postalCode) return;

        setSaving(true);
        const fullAddress = [address, address2, city, region, postalCode].filter(Boolean).join(', ');

        // Geocode the address
        let coordinates: [number, number] | null = null;
        try {
            const result = await geocodeAddress(fullAddress);
            coordinates = result;
        } catch (e) {
            console.error('Geocoding failed:', e);
        }

        const stopId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        const orders: MulchOrder[] = mulchOrders.map(o => ({
            mulchType: o.mulchType,
            quantity: o.quantity,
            scoutName: o.scoutName || 'Unknown',
            placementInstructions: o.placement ? [o.placement] : [],
            lineItems: [],
        }));

        const stop: DeliveryStop = {
            id: stopId,
            orderId: orderId || `MANUAL-${stopId.substring(0, 8)}`,
            orderName: '',
            orderDate,
            recipientName,
            recipientEmail,
            recipientPhone,
            fullAddress,
            postalCode,
            city,
            region,
            coordinates,
            mulchOrders: orders,
            spreadingOrder: null,
            totalBags: orders.reduce((sum, o) => sum + o.quantity, 0),
            fulfillmentNotes,
            isHotshot: false,
            isDisabled: false,
            allLineItems: [],
            routeId: null,
            spreadingRouteId: null,
        };

        dispatch({ type: 'ADD_STOP', payload: stop });
        setSaving(false);
        onClose();
    };

    return (
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
                        <h2 className="modal-title">Add Delivery Stop</h2>
                        <p className="modal-subtitle">Enter order details manually</p>
                    </div>
                    <button onClick={onClose} className="btn btn-ghost modal-close">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Recipient Info */}
                    <div className="modal-section">
                        <h3 className="modal-section-title">Recipient Information</h3>
                        <div className="form-grid">
                            <div className="form-field">
                                <label className="form-label">Recipient Name *</label>
                                <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="input" placeholder="John Doe" />
                            </div>
                            <div className="form-field">
                                <label className="form-label">Email</label>
                                <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className="input" placeholder="john@example.com" />
                            </div>
                            <div className="form-field">
                                <label className="form-label">Phone</label>
                                <input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} className="input" placeholder="(555) 123-4567" />
                            </div>
                        </div>
                    </div>

                    {/* Address */}
                    <div className="modal-section">
                        <h3 className="modal-section-title">Delivery Address</h3>
                        <div className="form-grid">
                            <div className="form-field form-field-full">
                                <label className="form-label">Address *</label>
                                <input value={address} onChange={(e) => setAddress(e.target.value)} className="input" placeholder="123 Main St" />
                            </div>
                            <div className="form-field form-field-full">
                                <label className="form-label">Address 2</label>
                                <input value={address2} onChange={(e) => setAddress2(e.target.value)} className="input" placeholder="Apt, Suite, etc." />
                            </div>
                            <div className="form-field">
                                <label className="form-label">City</label>
                                <input value={city} onChange={(e) => setCity(e.target.value)} className="input" placeholder="Plano" />
                            </div>
                            <div className="form-field">
                                <label className="form-label">State</label>
                                <input value={region} onChange={(e) => setRegion(e.target.value)} className="input" placeholder="TX" />
                            </div>
                            <div className="form-field">
                                <label className="form-label">Postal Code *</label>
                                <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="input" placeholder="75093" />
                            </div>
                        </div>
                    </div>

                    {/* Order Info */}
                    <div className="modal-section">
                        <h3 className="modal-section-title">Order Information</h3>
                        <div className="form-grid">
                            <div className="form-field">
                                <label className="form-label">Order ID</label>
                                <input value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input" placeholder="Auto-generated" />
                            </div>
                            <div className="form-field">
                                <label className="form-label">Order Date</label>
                                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="input" />
                            </div>
                        </div>
                    </div>

                    {/* Mulch Orders */}
                    <div className="modal-section">
                        <div className="section-header">
                            <h3 className="modal-section-title">Item Lines</h3>
                            <button onClick={addMulchOrder} className="btn btn-xs btn-outline">
                                <Plus size={12} /> Add Item
                            </button>
                        </div>

                        {mulchOrders.map((order, i) => (
                            <div key={i} className="item-line-card">
                                <div className="form-grid">
                                    <div className="form-field">
                                        <label className="form-label">Item Variation</label>
                                        <select
                                            value={order.mulchType}
                                            onChange={(e) => updateMulchOrder(i, 'mulchType', e.target.value)}
                                            className="input"
                                        >
                                            {MULCH_TYPES.map((t) => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-field">
                                        <label className="form-label">Item Quantity</label>
                                        <input
                                            type="number" min="1"
                                            value={order.quantity}
                                            onChange={(e) => updateMulchOrder(i, 'quantity', parseInt(e.target.value) || 1)}
                                            className="input"
                                        />
                                    </div>
                                    <div className="form-field">
                                        <label className="form-label">Scout to credit</label>
                                        <input
                                            value={order.scoutName}
                                            onChange={(e) => updateMulchOrder(i, 'scoutName', e.target.value)}
                                            className="input"
                                            placeholder="Scout Name"
                                        />
                                    </div>
                                    <div className="form-field">
                                        <label className="form-label">Placement Instructions</label>
                                        <input
                                            value={order.placement}
                                            onChange={(e) => updateMulchOrder(i, 'placement', e.target.value)}
                                            className="input"
                                            placeholder="Front yard, left side"
                                        />
                                    </div>
                                </div>
                                {mulchOrders.length > 1 && (
                                    <button onClick={() => removeMulchOrder(i)} className="btn btn-xs btn-ghost btn-danger item-line-remove">
                                        <X size={12} /> Remove
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Fulfillment Notes */}
                    <div className="modal-section">
                        <h3 className="modal-section-title">Fulfillment Notes</h3>
                        <textarea
                            value={fulfillmentNotes}
                            onChange={(e) => setFulfillmentNotes(e.target.value)}
                            className="input textarea"
                            rows={3}
                            placeholder="Special delivery instructions..."
                        />
                    </div>

                    {/* Actions */}
                    <div className="form-actions">
                        <button onClick={onClose} className="btn btn-outline">Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={!recipientName || !address || !postalCode || saving}
                            className="btn btn-primary"
                        >
                            {saving ? (
                                <><MapPin size={14} className="spinner" /> Geocoding...</>
                            ) : (
                                <><Save size={14} /> Add Stop</>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
