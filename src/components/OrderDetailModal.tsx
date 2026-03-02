'use client';

import { useState, useEffect } from 'react';
import { X, Save, Trash2, Edit3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppDispatch } from '@/src/lib/store';
import { geocodeAddress } from '@/src/lib/geocoder';
import type { DeliveryStop, MulchType, MulchOrder } from '@/src/lib/types';

const MULCH_TYPES: MulchType[] = ['Black', 'Aromatic Cedar', 'Fine Shredded Hardwood'];

interface OrderDetailModalProps {
    stop: DeliveryStop | null;
    onClose: () => void;
}

export function OrderDetailModal({ stop, onClose }: OrderDetailModalProps) {
    const dispatch = useAppDispatch();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Editable fields
    const [recipientName, setRecipientName] = useState('');
    const [recipientEmail, setRecipientEmail] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [fullAddress, setFullAddress] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [city, setCity] = useState('');
    const [region, setRegion] = useState('');
    const [orderId, setOrderId] = useState('');
    const [orderDate, setOrderDate] = useState('');
    const [fulfillmentNotes, setFulfillmentNotes] = useState('');
    const [mulchOrders, setMulchOrders] = useState<{ mulchType: MulchType; quantity: number; scoutName: string; placement: string }[]>([]);

    // Sync form from stop
    useEffect(() => {
        if (stop) {
            setRecipientName(stop.recipientName);
            setRecipientEmail(stop.recipientEmail);
            setRecipientPhone(stop.recipientPhone);
            setFullAddress(stop.fullAddress);
            setPostalCode(stop.postalCode);
            setCity(stop.city);
            setRegion(stop.region);
            setOrderId(stop.orderId);
            setOrderDate(stop.orderDate);
            setFulfillmentNotes(stop.fulfillmentNotes);
            setMulchOrders(stop.mulchOrders.map(o => ({
                mulchType: o.mulchType,
                quantity: o.quantity,
                scoutName: o.scoutName,
                placement: o.placementInstructions.join(', '),
            })));
            setIsEditing(false);
        }
    }, [stop]);

    if (!stop) return null;

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
        setSaving(true);

        // Re-geocode if address changed
        let coordinates = stop.coordinates;
        if (fullAddress !== stop.fullAddress) {
            try {
                coordinates = await geocodeAddress(fullAddress);
            } catch (e) {
                console.error('Geocoding failed:', e);
            }
        }

        const orders: MulchOrder[] = mulchOrders.map(o => ({
            mulchType: o.mulchType,
            quantity: o.quantity,
            scoutName: o.scoutName || 'Unknown',
            placementInstructions: o.placement ? [o.placement] : [],
            lineItems: [],
        }));

        const updatedStop: DeliveryStop = {
            ...stop,
            recipientName,
            recipientEmail,
            recipientPhone,
            fullAddress,
            postalCode,
            city,
            region,
            orderId,
            orderDate,
            fulfillmentNotes,
            coordinates,
            mulchOrders: orders,
            totalBags: orders.reduce((sum, o) => sum + o.quantity, 0),
        };

        dispatch({ type: 'UPDATE_STOP', payload: updatedStop });
        setSaving(false);
        setIsEditing(false);
    };

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this stop?')) {
            dispatch({ type: 'REMOVE_STOP', payload: stop.id });
            onClose();
        }
    };

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
                                {isEditing ? 'Edit Stop' : stop.recipientName}
                            </h2>
                            <p className="modal-subtitle">{isEditing ? 'Modify delivery details' : stop.fullAddress}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {!isEditing && (
                                <button onClick={() => setIsEditing(true)} className="btn btn-ghost" title="Edit">
                                    <Edit3 size={18} />
                                </button>
                            )}
                            <button onClick={onClose} className="btn btn-ghost modal-close">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="modal-body">
                        {isEditing ? (
                            /* ─── EDIT MODE ─── */
                            <>
                                <div className="modal-section">
                                    <h3 className="modal-section-title">Recipient Information</h3>
                                    <div className="form-grid">
                                        <div className="form-field">
                                            <label className="form-label">Recipient Name</label>
                                            <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="input" />
                                        </div>
                                        <div className="form-field">
                                            <label className="form-label">Recipient Email</label>
                                            <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className="input" />
                                        </div>
                                        <div className="form-field">
                                            <label className="form-label">Recipient Phone</label>
                                            <input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} className="input" />
                                        </div>
                                    </div>
                                </div>

                                <div className="modal-section">
                                    <h3 className="modal-section-title">Delivery Address</h3>
                                    <div className="form-grid">
                                        <div className="form-field form-field-full">
                                            <label className="form-label">Recipient Address</label>
                                            <input value={fullAddress} onChange={(e) => setFullAddress(e.target.value)} className="input" />
                                        </div>
                                        <div className="form-field">
                                            <label className="form-label">Recipient City</label>
                                            <input value={city} onChange={(e) => setCity(e.target.value)} className="input" />
                                        </div>
                                        <div className="form-field">
                                            <label className="form-label">Recipient Region</label>
                                            <input value={region} onChange={(e) => setRegion(e.target.value)} className="input" />
                                        </div>
                                        <div className="form-field">
                                            <label className="form-label">Recipient Postal Code</label>
                                            <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="input" />
                                        </div>
                                    </div>
                                </div>

                                <div className="modal-section">
                                    <h3 className="modal-section-title">Order Information</h3>
                                    <div className="form-grid">
                                        <div className="form-field">
                                            <label className="form-label">Order ID</label>
                                            <input value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input" />
                                        </div>
                                        <div className="form-field">
                                            <label className="form-label">Order Date</label>
                                            <input value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="input" />
                                        </div>
                                    </div>
                                </div>

                                <div className="modal-section">
                                    <div className="section-header">
                                        <h3 className="modal-section-title">Item Lines</h3>
                                        <button onClick={addMulchOrder} className="btn btn-xs btn-outline">+ Add Item</button>
                                    </div>
                                    {mulchOrders.map((order, i) => (
                                        <div key={i} className="item-line-card">
                                            <div className="form-grid">
                                                <div className="form-field">
                                                    <label className="form-label">Item Variation</label>
                                                    <select value={order.mulchType} onChange={(e) => updateMulchOrder(i, 'mulchType', e.target.value)} className="input">
                                                        {MULCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                                <div className="form-field">
                                                    <label className="form-label">Item Quantity</label>
                                                    <input type="number" min="1" value={order.quantity} onChange={(e) => updateMulchOrder(i, 'quantity', parseInt(e.target.value) || 1)} className="input" />
                                                </div>
                                                <div className="form-field">
                                                    <label className="form-label">Scout to credit</label>
                                                    <input value={order.scoutName} onChange={(e) => updateMulchOrder(i, 'scoutName', e.target.value)} className="input" />
                                                </div>
                                                <div className="form-field">
                                                    <label className="form-label">Placement</label>
                                                    <input value={order.placement} onChange={(e) => updateMulchOrder(i, 'placement', e.target.value)} className="input" />
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

                                <div className="modal-section">
                                    <h3 className="modal-section-title">Fulfillment Notes</h3>
                                    <textarea value={fulfillmentNotes} onChange={(e) => setFulfillmentNotes(e.target.value)} className="input textarea" rows={3} />
                                </div>

                                <div className="form-actions">
                                    <button onClick={handleDelete} className="btn btn-outline btn-danger">
                                        <Trash2 size={14} /> Delete
                                    </button>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => setIsEditing(false)} className="btn btn-outline">Cancel</button>
                                        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                                            {saving ? 'Saving...' : <><Save size={14} /> Save</>}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* ─── VIEW MODE ─── */
                            <>
                                <div className="modal-section">
                                    <h3 className="modal-section-title">Recipient Information</h3>
                                    <div className="modal-grid">
                                        <div className="modal-field">
                                            <span className="modal-field-label">Order ID</span>
                                            <span className="modal-field-value">{stop.orderId}</span>
                                        </div>
                                        <div className="modal-field">
                                            <span className="modal-field-label">Order Date</span>
                                            <span className="modal-field-value">{stop.orderDate}</span>
                                        </div>
                                        <div className="modal-field">
                                            <span className="modal-field-label">Recipient Email</span>
                                            <span className="modal-field-value">{stop.recipientEmail || '—'}</span>
                                        </div>
                                        <div className="modal-field">
                                            <span className="modal-field-label">Recipient Phone</span>
                                            <span className="modal-field-value">{stop.recipientPhone || '—'}</span>
                                        </div>
                                        <div className="modal-field form-field-full">
                                            <span className="modal-field-label">Recipient Address</span>
                                            <span className="modal-field-value">{stop.fullAddress}</span>
                                        </div>
                                    </div>
                                </div>

                                {stop.mulchOrders.length > 0 && (
                                    <div className="modal-section">
                                        <h3 className="modal-section-title">Item Lines</h3>
                                        {stop.mulchOrders.map((order, i) => (
                                            <div key={i} className="modal-order-card">
                                                <div className="modal-order-header">
                                                    <span className={`mulch-badge mulch-${order.mulchType.toLowerCase().replace(/\s+/g, '-')}`}>
                                                        {order.mulchType}
                                                    </span>
                                                    <span className="modal-order-qty">{order.quantity} bags</span>
                                                </div>
                                                <div className="modal-order-details">
                                                    <span>Scout: {order.scoutName}</span>
                                                    {order.placementInstructions.length > 0 && (
                                                        <span>Placement: {order.placementInstructions.join(', ')}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {stop.spreadingOrder && (
                                    <div className="modal-section">
                                        <h3 className="modal-section-title">Spreading Service</h3>
                                        <div className="modal-order-card">
                                            <span className="modal-order-qty">{stop.spreadingOrder.quantity} bags to spread</span>
                                        </div>
                                    </div>
                                )}

                                {stop.fulfillmentNotes && (
                                    <div className="modal-section">
                                        <h3 className="modal-section-title">Fulfillment Notes</h3>
                                        <p className="modal-notes">{stop.fulfillmentNotes}</p>
                                    </div>
                                )}

                                {stop.allLineItems.length > 0 && (
                                    <div className="modal-section">
                                        <h3 className="modal-section-title">Raw CSV Data</h3>
                                        <div className="raw-data-table-wrapper">
                                            <table className="raw-data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Row</th>
                                                        <th>Field</th>
                                                        <th>Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {stop.allLineItems.map((item, itemIdx) => (
                                                        Object.entries(item.rawRow).map(([key, value], fieldIdx) => (
                                                            <tr key={`${itemIdx}-${fieldIdx}`} className={itemIdx % 2 === 0 ? '' : 'raw-data-alt'}>
                                                                {fieldIdx === 0 && (
                                                                    <td rowSpan={Object.keys(item.rawRow).length} className="raw-data-row-num">
                                                                        #{item.csvRowIndex}
                                                                    </td>
                                                                )}
                                                                <td className="raw-data-field">{key}</td>
                                                                <td className="raw-data-value">{String(value) || '—'}</td>
                                                            </tr>
                                                        ))
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                <div className="form-actions">
                                    <button onClick={handleDelete} className="btn btn-outline btn-danger">
                                        <Trash2 size={14} /> Delete Stop
                                    </button>
                                    <button onClick={() => setIsEditing(true)} className="btn btn-primary">
                                        <Edit3 size={14} /> Edit
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
