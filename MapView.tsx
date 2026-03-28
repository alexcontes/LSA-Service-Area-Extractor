import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';

interface MapViewProps {
  onPolygonDrawn: (coords: number[][]) => void;
  centerRequest?: { lat: number, lng: number, radius: number } | null;
}

const MapView: React.FC<MapViewProps> = ({ onPolygonDrawn, centerRequest }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const historyRef = useRef<L.Layer[]>([]);

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
      drawRectangle: true,
      drawPolygon: true,
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

    // Listen for manual drawing
    // @ts-ignore
    map.on('pm:create', (e: any) => {
      const { layer } = e;
      historyRef.current.push(layer);

      if (layer instanceof L.Polygon || layer instanceof L.Rectangle || layer instanceof L.Circle || layer instanceof L.Polyline) {
        let coords: number[][] = [];
        
        if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
          const latlngs = layer.getLatLngs();
          const firstRing = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
          coords = (firstRing as L.LatLng[]).map(ll => [ll.lat, ll.lng]);
        } else if (layer instanceof L.Polyline) {
          const latlngs = layer.getLatLngs() as L.LatLng[];
          coords = latlngs.map(ll => [ll.lat, ll.lng]);
        } else if (layer instanceof L.Circle) {
          const center = layer.getLatLng();
          coords = [[center.lat, center.lng]];
        }

        if (coords.length > 0) {
          onPolygonDrawn(coords);
        }
      }
    });

    // Keyboard shortcuts for Undo
    const handleKeyDown = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey;
      
      if (isUndo) {
        e.preventDefault();
        const lastLayer = historyRef.current.pop();
        if (lastLayer) {
          lastLayer.remove();
          // If it was the current search circle, clear the ref
          if (lastLayer === circleRef.current) {
            circleRef.current = null;
          }
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
  }, [onPolygonDrawn]);

  // Handle address searches and programmatic radius
  useEffect(() => {
    if (!mapRef.current || !centerRequest) return;

    const { lat, lng, radius } = centerRequest;
    const map = mapRef.current;

    // Remove previous radial search circle
    if (circleRef.current) {
      circleRef.current.remove();
      // Also remove from history if it's there
      historyRef.current = historyRef.current.filter(l => l !== circleRef.current);
    }

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
    historyRef.current.push(circle);

    // Zoom and pan
    map.setView([lat, lng], 12);
    setTimeout(() => {
      map.fitBounds(circle.getBounds(), { padding: [40, 40], animate: true });
    }, 100);

  }, [centerRequest]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
};

export default MapView;
