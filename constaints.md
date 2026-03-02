Feature Roadmap: CSV-to-Route Delivery Optimizer

Based on the uploaded order data (Scouting Mulch Sale), here is a feature breakdown for a specialized delivery mapping web application.

1. Data Ingestion & Smart Parsing

Dynamic Column Mapping: Allow users to map their CSV columns to app fields (e.g., mapping Recipient Address to Street, Item Quantity to Load).

Address Validation & Geocoding: Automatically convert text addresses into precise GPS coordinates using Google Maps or Mapbox APIs.

Outlier (Hotshot) Identification: Automatically flag and label "Outliers"—addresses that are significantly far from the main clusters of deliveries. These can be prioritized for special handling or assigned to a specific "Hotshot" vehicle.

Data Cleaning Dashboard: Flag incomplete addresses, invalid zip codes, or duplicate orders before processing.

Multi-Item Aggregation: Since some orders might have multiple line items, the app should group these by Order Name or Order ID into a single delivery stop.

2. Vehicle & Capacity Profiles

Mulch Capacity Limits: Define the maximum number of bags each delivery vehicle can carry (e.g., Trailer A: 100 bags, Truck B: 40 bags).

Single-Type Constraint: A specialized setting to ensure each delivery vehicle is loaded with only one type of mulch per trip (e.g., a truck only carries "Black" mulch for its entire route to simplify loading and unloading).

Load Balancing: Automatically distribute orders across the fleet based on capacity while respecting the single-item-type constraint.

3. Route Optimization & Manual Control

The "Traveling Salesman" Logic: Calculate the most fuel-efficient sequence of stops for a single vehicle.

Manual Route Mapping: An "empty canvas" mode where users can select markers on the map to manually build a route from scratch, rather than relying on the algorithm.

Interactive Route Editor: Drag-and-drop interface to manually reorder stops or move a delivery from one vehicle's route to another on the fly.

Optimization Goals: Toggle between different optimization features, such as "Shortest Distance," "Fastest Time," or "Balanced Load."

Start/End Point Customization: Set the "Distribution Center" (e.g., the church parking lot where the mulch is staged) as the start and end of every trip.

4. On-the-Road Execution

Mobile Driver View: A simplified, touch-friendly interface for drivers showing one stop at a time.

Integrated Navigation: One-tap buttons to open the address in Google Maps, Apple Maps, or Waze.

Delivery Instructions Display: Highlighting the Item Modifiers field (e.g., "1/2 Way up the Front Walk" or "In Garden Bed") so drivers know exactly where to drop the bags.

Photo Proof of Delivery: Ability to snap a photo of the delivered mulch to attach to the order record for internal verification.

5. Scouting Fundraiser Specifics

Scout Credit Tracking: View deliveries by "Scout name to credit" (from your Item Modifiers column) to help coordinate which families are delivering which orders.

Service vs. Product Separation: Filter for "Spreading" items versus "Delivery Only" items, as these require different labor allocations even if the mulch type is the same.

Zone Tagging: Group orders by Recipient Postal Code or City to assign specific neighborhoods to specific teams.

6. Technical Stack Recommendation

Framework: Next.js (App Router)

Styling: Tailwind CSS

Map Engine: Mapbox GL JS (Supports complex routing constraints)

Drag-and-Drop: @hello-pangea/dnd (For the Interactive Route Editor)

CSV Parsing: papaparse

Geospatial Logic: turf.js (To identify "Hotshot" outliers)