import Papa from 'papaparse';
import type { RawCSVRow, ParsedLineItem, DeliveryStop, MulchOrder, SpreadingOrder, MulchType } from './types';

const MULCH_TYPES: MulchType[] = ['Black', 'Aromatic Cedar', 'Fine Shredded Hardwood'];

/**
 * Extract "Scout to credit" from Item Modifiers string.
 * Pattern: "1 x Scout name to credit ...: <ScoutName>"
 */
function extractScoutName(modifiers: string): string {
    if (!modifiers) return 'Unknown';
    const match = modifiers.match(
        /Scout name to credit[^:]*:\s*(.+?)(?:,\s*1\s*x|$)/i
    );
    if (match && match[1]) {
        const name = match[1].trim();
        return name || 'Unknown';
    }
    return 'Unknown';
}

/**
 * Extract placement instructions from Item Modifiers.
 * Pattern: "1 x <Instruction>" (e.g., "1 x In Garden Bed", "1 x Side of House")
 */
function extractPlacementInstructions(modifiers: string): string[] {
    if (!modifiers) return [];
    const instructions: string[] = [];
    const regex = /1\s*x\s*((?:In Garden Bed|Side of House|1\/2 Way up the Front Walk))/gi;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(modifiers)) !== null) {
        instructions.push(m[1].trim());
    }
    return instructions;
}

/**
 * Parse a CSV file string into raw rows and parsed line items.
 */
export function parseCSV(csvString: string): { raw: RawCSVRow[]; lineItems: ParsedLineItem[] } {
    const result = Papa.parse<RawCSVRow>(csvString, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
    });

    const raw = result.data;
    const lineItems: ParsedLineItem[] = raw.map((row, index) => ({
        csvRowIndex: index + 1, // 1-indexed to match spreadsheet rows (header=0)
        rawRow: row,
        orderId: row['Order'] || '',
        orderName: row['Order Name'] || '',
        orderDate: row['Order Date'] || '',
        recipientName: row['Recipient Name'] || '',
        recipientEmail: row['Recipient Email'] || '',
        recipientPhone: row['Recipient Phone'] || '',
        address: row['Recipient Address'] || '',
        address2: row['Recipient Address 2'] || '',
        postalCode: row['Recipient Postal Code'] || '',
        city: row['Recipient City'] || '',
        region: row['Recipient Region'] || '',
        itemQuantity: parseInt(row['Item Quantity'] || '0', 10) || 0,
        itemName: row['Item Name'] || '',
        itemVariation: row['Item Variation'] || '',
        itemModifiers: row['Item Modifiers'] || '',
        scoutName: extractScoutName(row['Item Modifiers'] || ''),
        placementInstructions: extractPlacementInstructions(row['Item Modifiers'] || ''),
        fulfillmentNotes: row['Fulfillment Notes'] || '',
        itemTotalPrice: parseFloat(row['Item Total Price'] || '0') || 0,
    }));

    return { raw, lineItems };
}

/**
 * Aggregate line items into delivery stops grouped by recipient address.
 * Uses address + postal code as the grouping key since Order Name is actually recipient name.
 */
export function aggregateStops(lineItems: ParsedLineItem[]): { stops: Record<string, DeliveryStop>; stopOrder: string[] } {
    const stopMap = new Map<string, ParsedLineItem[]>();

    for (const item of lineItems) {
        // Skip donations and test transactions
        if (item.itemName === 'Donation') continue;

        // Group by normalized address + postal code
        const key = `${item.address.toLowerCase().trim()}|${item.postalCode.trim()}`;
        if (!stopMap.has(key)) {
            stopMap.set(key, []);
        }
        stopMap.get(key)!.push(item);
    }

    const stops: Record<string, DeliveryStop> = {};
    const stopOrder: string[] = [];

    let counter = 0;
    for (const [, items] of stopMap) {
        counter++;
        const id = `stop-${counter}`;
        const first = items[0];

        // Separate mulch orders from spreading
        const mulchItems = items.filter(
            (i) => i.itemName === 'Jemasco Mulch' && MULCH_TYPES.includes(i.itemVariation as MulchType)
        );
        const spreadingItems = items.filter((i) => i.itemName === 'Spreading');

        // Group mulch by type
        const mulchByType = new Map<MulchType, ParsedLineItem[]>();
        for (const mi of mulchItems) {
            const type = mi.itemVariation as MulchType;
            if (!mulchByType.has(type)) mulchByType.set(type, []);
            mulchByType.get(type)!.push(mi);
        }

        const mulchOrders: MulchOrder[] = [];
        for (const [type, typeItems] of mulchByType) {
            const quantity = typeItems.reduce((sum, i) => sum + i.itemQuantity, 0);
            const scouts = [...new Set(typeItems.map((i) => i.scoutName).filter((s) => s !== 'Unknown'))];
            const placements = [...new Set(typeItems.flatMap((i) => i.placementInstructions))];
            mulchOrders.push({
                mulchType: type,
                quantity,
                scoutName: scouts.length > 0 ? scouts.join(', ') : typeItems[0]?.scoutName || 'Unknown',
                placementInstructions: placements,
                lineItems: typeItems,
            });
        }

        const spreadingOrder: SpreadingOrder | null = spreadingItems.length > 0
            ? {
                quantity: spreadingItems.reduce((sum, i) => sum + i.itemQuantity, 0),
                lineItems: spreadingItems,
            }
            : null;

        const totalBags = mulchOrders.reduce((sum, o) => sum + o.quantity, 0);

        // Collect all unique fulfillment notes
        const notes = [...new Set(items.map((i) => i.fulfillmentNotes).filter(Boolean))].join(' | ');

        // Collect all unique order IDs for this address
        const orderIds = [...new Set(items.map((i) => i.orderId))];

        stops[id] = {
            id,
            orderId: orderIds.join(', '),
            orderName: first.orderName,
            orderDate: first.orderDate,
            recipientName: first.recipientName,
            recipientEmail: first.recipientEmail,
            recipientPhone: first.recipientPhone,
            fullAddress: `${first.address}, ${first.city}, ${first.region} ${first.postalCode}`,
            postalCode: first.postalCode,
            city: first.city,
            region: first.region,
            coordinates: null,
            mulchOrders,
            spreadingOrder,
            totalBags,
            fulfillmentNotes: notes,
            isHotshot: false,
            isDisabled: false,
            allLineItems: items,
            routeId: null,
        };
        stopOrder.push(id);
    }

    return { stops, stopOrder };
}
