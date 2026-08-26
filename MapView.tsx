import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';

interface MapViewProps {
  onPolygonDrawn: (coords: number[][]) => void;
  onClear?: () => void;
  centerRequest?: { lat: number, lng: number, radius: number } | null;
}

const MapView: React.FC<MapViewProps> = ({ onPolygonDrawn, onClear, centerRequest }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const drawnLayersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Default centered on USA
    const map = L.map(mapContainerRef.current, {
      center: [39.8283, -98.5795],
      zoom: 4,
      zoomControl: false
    });
    mapRef.current = map;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Geoman Setup
    // @ts-ignore
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: true,
      drawPolygon: true,
      drawCircle: true,
      editMode: true,
      removalMode: true,
      dragMode: true
    });

    // Drawing Style
    // @ts-ignore
    map.pm.setGlobalOptions({
      pathOptions: {
        color: '#2563eb',
        fillOpacity: 0.2,
        weight: 3
      }
    });

    // Listen for draw start - immediately clear previous drawings and stale cached results
    // @ts-ignore
    map.on('pm:drawstart', () => {
      // Clean up previous search circle
      if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }
      // Remove previous drawn layers
      drawnLayersRef.current.forEach(layer => layer.remove());
      drawnLayersRef.current = [];

      // Clear extracted results and cache
      if (onClear) {
        onClear();
      }
    });

    // Listen for manual drawing completion
    // @ts-ignore
    map.on('pm:create', (e: any) => {
      const { layer } = e;

      // Clean up any other previous shapes so only the new shape remains
      drawnLayersRef.current.forEach(l => {
        if (l !== layer) l.remove();
      });
      drawnLayersRef.current = [layer];

      if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }

      // Clear previous cache/results before extracting new shape
      if (onClear) {
        onClear();
      }

      if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
        const latlngs = layer.getLatLngs();
        const firstRing = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
        const coords = (firstRing as L.LatLng[]).map(ll => [ll.lat, ll.lng]);
        onPolygonDrawn(coords);
      } else if (layer instanceof L.Circle) {
        const center = layer.getLatLng();
        const radiusMeters = layer.getRadius();
        
        // Convert circle to polygon for AI extraction
        const points = 32;
        const radiusInDeg = (radiusMeters / 1000) / 111.32;
        const polygonCoords: number[][] = [];
        
        for (let i = 0; i < points; i++) {
          const angle = (i / points) * (2 * Math.PI);
          const latOffset = radiusInDeg * Math.cos(angle);
          const lngOffset = (radiusInDeg * Math.sin(angle)) / Math.cos(center.lat * Math.PI / 180);
          polygonCoords.push([center.lat + latOffset, center.lng + lngOffset]);
        }
        polygonCoords.push(polygonCoords[0]); // Close
        onPolygonDrawn(polygonCoords);
      }
    });

    // Listen for layer removal via Geoman UI removal tool
    // @ts-ignore
    map.on('pm:remove', (e: any) => {
      drawnLayersRef.current = drawnLayersRef.current.filter(l => l !== e.layer);
      if (drawnLayersRef.current.length === 0 && !circleRef.current) {
        if (onClear) {
          onClear();
        }
      }
    });

    // Keyboard Undo Support (Ctrl + Z / Cmd + Z)
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is editing a text input or textarea, let default browser undo happen
      const activeEl = document.activeElement;
      const isTextInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );
      if (isTextInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();

        // 1. If currently in the middle of drawing a shape with Geoman, disable drawing mode
        // @ts-ignore
        if (map.pm && map.pm.globalDrawModeEnabled()) {
          // @ts-ignore
          map.pm.disableDraw();
        }

        // 2. Remove radial search circle if present
        let didRemove = false;
        if (circleRef.current) {
          circleRef.current.remove();
          circleRef.current = null;
          didRemove = true;
        }

        // 3. Remove last drawn layer
        const lastLayer = drawnLayersRef.current.pop();
        if (lastLayer) {
          lastLayer.remove();
          didRemove = true;
        }

        // 4. Remove any remaining layers if all are popped
        // @ts-ignore
        if (drawnLayersRef.current.length === 0 && map.pm && typeof map.pm.getGeomanLayers === 'function') {
          // @ts-ignore
          map.pm.getGeomanLayers().forEach((l: any) => l.remove());
        }

        // 5. Clear the extracted areas and reset cache
        if (onClear) {
          onClear();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [onPolygonDrawn, onClear]);

  // Handle address searches and programmatic radius
  useEffect(() => {
    if (!mapRef.current || !centerRequest) return;

    const { lat, lng, radius } = centerRequest;
    const map = mapRef.current;

    // Remove previous radial search circle & drawn shapes
    if (circleRef.current) {
      circleRef.current.remove();
    }
    drawnLayersRef.current.forEach(layer => layer.remove());
    drawnLayersRef.current = [];

    // Convert miles to meters for Leaflet's circle
    const radiusMeters = radius * 1609.34;

    // Create a visual indicator of the search area
    const circle = L.circle([lat, lng], {
      radius: radiusMeters,
      color: '#2563eb',
      fillColor: '#2563eb',
      fillOpacity: 0.15,
      weight: 3,
      dashArray: '10, 10'
    }).addTo(map);

    circleRef.current = circle;

    // Zoom and pan
    map.setView([lat, lng], 12);
    setTimeout(() => {
      map.fitBounds(circle.getBounds(), { padding: [40, 40], animate: true });
    }, 100);

  }, [centerRequest]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
};

export default MapView;
