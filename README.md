# 🚚 Mulch Delivery Mapper

A specialized route optimization and delivery management web application designed for mulch fundraisers and large-scale delivery operations.

## ✨ Key Features

- **📊 Data Ingestion & Smart Parsing**: 
  - Dynamic CSV column mapping.
  - Automatic address validation and geocoding using Mapbox.
  - Multi-item order aggregation into single delivery stops.
- **🚛 Vehicle & Capacity Management**:
  - Customizable vehicle profiles with bag capacity limits.
  - Load balancing across the fleet.
  - specialized "Single-Type Constraint" for simplified loading (one mulch type per trip).
- **🗺️ Interactive Route Optimization**:
  - Automated "Traveling Salesman" logic for fuel-efficient sequencing.
  - Manual "Empty Canvas" mode for hand-picking stops.
  - Drag-and-drop route editor to reorder or move stops between vehicles.
  - "Depot" integration for consistent start/end points.
- **📍 Hotshot Identification**:
  - Automatic detection of geographic outliers using `turf.js`.
- **📱 Driver & Field Tools**:
  - Touch-friendly mobile interface.
  - One-tap navigation to Google/Apple Maps/Waze.
  - Clear display of delivery instructions and modifiers.

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Map Engine**: [Mapbox GL JS](https://www.mapbox.com/)
- **Drag-and-Drop**: [@hello-pangea/dnd](https://github.com/hello-pangea/dnd)
- **Geospatial Logic**: [turf.js](https://turfjs.org/)
- **CSV Parsing**: [Papa Parse](https://www.papaparse.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Mapbox API Token

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/mulch-delivery-mapper.git
   cd mulch-delivery-mapper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📅 Roadmap

- [x] CSV Parsing & Column Mapping
- [x] Mapbox Integration & Geocoding
- [x] Vehicle Capacity Constraints
- [x] Route Sorting & Depot Pinning
- [x] CSV & PDF Route Export
- [ ] Mobile Driver View & Navigation
- [ ] Photo Proof of Delivery
- [ ] Scout Credit Tracking & Filtering

---
Built for scouts, volunteers, and delivery teams.
