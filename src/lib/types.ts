// ── Raw CSV row exactly as exported from Square Online ──
export interface RawCSVRow {
  Order: string;
  'Order Name': string;
  'Order Date': string;
  Currency: string;
  'Order Subtotal': string;
  'Order Shipping Price': string;
  'Order Tax Total': string;
  'Order Total': string;
  'Order Refunded Amount': string;
  'Fulfillment Date': string;
  'Fulfillment Type': string;
  'Fulfillment Status': string;
  Channels: string;
  'Fulfillment Location': string;
  'Fulfillment Notes': string;
  'Recipient Name': string;
  'Recipient Email': string;
  'Recipient Phone': string;
  'Recipient Address': string;
  'Recipient Address 2': string;
  'Recipient Postal Code': string;
  'Recipient City': string;
  'Recipient Region': string;
  'Recipient Country': string;
  'Item Quantity': string;
  'Item Name': string;
  'Item SKU': string;
  'Item Variation': string;
  'Item Modifiers': string;
  'Item Price': string;
  'Item Options Total Price': string;
  'Item Total Price': string;
}

// ── Parsed individual line item with CSV row provenance ──
export interface ParsedLineItem {
  csvRowIndex: number;
  rawRow: RawCSVRow;
  orderId: string;
  orderName: string;
  orderDate: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  address: string;
  address2: string;
  postalCode: string;
  city: string;
  region: string;
  itemQuantity: number;
  itemName: string;        // "Jemasco Mulch", "Spreading", "Donation"
  itemVariation: string;   // "Black", "Aromatic Cedar", "Fine Shredded Hardwood", "Regular", "Custom Amount"
  itemModifiers: string;
  scoutName: string;
  placementInstructions: string[];
  fulfillmentNotes: string;
  itemTotalPrice: number;
}

// ── Mulch type enum ──
export type MulchType = 'Black' | 'Aromatic Cedar' | 'Fine Shredded Hardwood';

// ── A mulch order within a delivery stop ──
export interface MulchOrder {
  mulchType: MulchType;
  quantity: number;
  scoutName: string;
  placementInstructions: string[];
  lineItems: ParsedLineItem[];
}

// ── Spreading service within a stop ──
export interface SpreadingOrder {
  quantity: number;
  lineItems: ParsedLineItem[];
}

// ── Aggregated delivery stop ──
export interface DeliveryStop {
  id: string;
  orderId: string;
  orderName: string;
  orderDate: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  fullAddress: string;
  postalCode: string;
  city: string;
  region: string;
  coordinates: [number, number] | null; // [lng, lat]
  mulchOrders: MulchOrder[];
  spreadingOrder: SpreadingOrder | null;
  totalBags: number;
  fulfillmentNotes: string;
  isHotshot: boolean;
  isDisabled: boolean; // excluded from routing but still displayed
  allLineItems: ParsedLineItem[];
  routeId: string | null;
}

// ── Vehicle types ──
export type VehicleType = 'Truck' | 'Trailer';

export interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  capacity: number; // max bags
}

// ── Route ──
export interface Route {
  id: string;
  name: string;
  vehicleId: string;
  mulchType: MulchType | null;   // enforced single-type constraint
  stopIds: string[];
  color: string;
  visible: boolean;
  optimized: boolean;
  routeGeometry: GeoJSON.LineString | null;
  distanceMiles: number | null;     // total route distance
  durationMinutes: number | null;   // total drive time
}

// ── Filters ──
export interface FilterState {
  mulchTypes: MulchType[];
  vehicleTypes: VehicleType[];
  vehicleId: string | null;
  showUnassigned: boolean;
  showHotshotsOnly: boolean;
  showDisabled: boolean;
}

// ── Map overlay fields ──
export interface OverlayConfig {
  showScoutName: boolean;
  showBagCount: boolean;
  showSpecialInstructions: boolean;
}

// ── App settings ──
export interface AppSettings {
  fuelCostPerMile: number;     // $ per mile
  depotAddress: string;        // starting location for routes
  depotCoords: [number, number] | null; // geocoded depot coordinates
  defaultCapacity: number;     // default bags for new vehicles
  mapboxToken: string;         // editable Mapbox token
}

// ── Optimization mode ──
export type OptimizationMode = 'distance' | 'duration';

// ── App state ──
export interface AppState {
  // Data
  rawCSVData: RawCSVRow[];
  lineItems: ParsedLineItem[];
  stops: Record<string, DeliveryStop>;
  stopOrder: string[]; // ordered list of stop IDs

  // Vehicles & Routes
  vehicles: Record<string, Vehicle>;
  routes: Record<string, Route>;

  // Settings
  settings: AppSettings;

  // UI state
  filters: FilterState;
  overlays: OverlayConfig;
  selectedStopId: string | null;
  selectedRouteId: string | null;
  isManualRouteMode: boolean;
  manualRouteStops: string[];
  isDriveMode: boolean;
  driveModRouteId: string | null;
  driveModeStopIndex: number;

  // Status
  isLoading: boolean;
  geocodingProgress: number;
  totalToGeocode: number;
}

// ── Auto-route generation config ──
export interface AutoRouteConfig {
  groupBy: 'mulchType' | 'postalCode' | 'proximity';
  vehicleId: string;
  maxBagsPerRoute: number;
  mulchTypeFilter?: MulchType;
}

// ── Action types for the reducer ──
export type AppAction =
  | { type: 'LOAD_CSV'; payload: { raw: RawCSVRow[]; lineItems: ParsedLineItem[]; stops: Record<string, DeliveryStop>; stopOrder: string[] } }
  | { type: 'SET_COORDINATES'; payload: { stopId: string; coordinates: [number, number] } }
  | { type: 'SET_HOTSHOT'; payload: { stopId: string; isHotshot: boolean } }
  | { type: 'ADD_STOP'; payload: DeliveryStop }
  | { type: 'UPDATE_STOP'; payload: DeliveryStop }
  | { type: 'REMOVE_STOP'; payload: string }
  | { type: 'TOGGLE_STOP_DISABLED'; payload: string }
  | { type: 'ADD_VEHICLE'; payload: Vehicle }
  | { type: 'UPDATE_VEHICLE'; payload: Vehicle }
  | { type: 'REMOVE_VEHICLE'; payload: string }
  | { type: 'CREATE_ROUTE'; payload: Route }
  | { type: 'UPDATE_ROUTE'; payload: Partial<Route> & { id: string } }
  | { type: 'DELETE_ROUTE'; payload: string }
  | { type: 'ASSIGN_STOP_TO_ROUTE'; payload: { stopId: string; routeId: string; index?: number } }
  | { type: 'REMOVE_STOP_FROM_ROUTE'; payload: { stopId: string; routeId: string } }
  | { type: 'REORDER_ROUTE_STOPS'; payload: { routeId: string; stopIds: string[] } }
  | { type: 'MOVE_STOP_BETWEEN_ROUTES'; payload: { stopId: string; sourceRouteId: string; destRouteId: string; destIndex: number } }
  | { type: 'TOGGLE_ROUTE_VISIBILITY'; payload: string }
  | { type: 'BATCH_CREATE_ROUTES'; payload: Route[] }
  | { type: 'BATCH_ASSIGN_STOPS'; payload: { assignments: { stopId: string; routeId: string }[] } }
  | { type: 'SET_FILTERS'; payload: Partial<FilterState> }
  | { type: 'SET_OVERLAYS'; payload: Partial<OverlayConfig> }
  | { type: 'SET_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'SELECT_STOP'; payload: string | null }
  | { type: 'SELECT_ROUTE'; payload: string | null }
  | { type: 'TOGGLE_MANUAL_ROUTE_MODE'; payload?: undefined }
  | { type: 'ADD_MANUAL_ROUTE_STOP'; payload: string }
  | { type: 'CLEAR_MANUAL_ROUTE' }
  | { type: 'SET_DRIVE_MODE'; payload: { enabled: boolean; routeId?: string } }
  | { type: 'SET_DRIVE_MODE_INDEX'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_GEOCODING_PROGRESS'; payload: { progress: number; total: number } }
  | { type: 'SET_ROUTE_GEOMETRY'; payload: { routeId: string; geometry: GeoJSON.LineString } }
  | { type: 'SET_ROUTE_STATS'; payload: { routeId: string; distanceMiles: number; durationMinutes: number } }
  | { type: 'RESTORE_STATE'; payload: Partial<AppState> };
