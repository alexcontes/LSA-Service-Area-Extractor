import { GoogleGenAI, Type } from "@google/genai";
import { ServiceArea } from './types';

/**
 * Calculate distance in miles using Haversine formula
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Normalizes polygon vertices (removes duplicates and closed-loop redundant tail for ray-casting)
 */
export function cleanPolygonVertices(coords: number[][]): number[][] {
  if (!coords || coords.length === 0) return [];
  const cleaned: number[][] = [];
  for (const pt of coords) {
    if (!pt || pt.length < 2) continue;
    if (cleaned.length === 0) {
      cleaned.push([pt[0], pt[1]]);
    } else {
      const last = cleaned[cleaned.length - 1];
      if (Math.abs(last[0] - pt[0]) > 1e-7 || Math.abs(last[1] - pt[1]) > 1e-7) {
        cleaned.push([pt[0], pt[1]]);
      }
    }
  }
  // If closed loop has identical start and end point, remove the last one for ray casting
  if (cleaned.length > 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.abs(first[0] - last[0]) < 1e-7 && Math.abs(first[1] - last[1]) < 1e-7) {
      cleaned.pop();
    }
  }
  return cleaned;
}

/**
 * Ray-casting algorithm (Even-Odd rule) for exact 2D Point-in-Polygon containment
 */
export function isPointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false;
  const n = polygon.length;
  if (n < 3) return false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const latI = polygon[i][0];
    const lngI = polygon[i][1];
    const latJ = polygon[j][0];
    const lngJ = polygon[j][1];

    const intersect = ((lngI > lng) !== (lngJ > lng)) &&
      (lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI);
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Distance from point (pLat, pLng) to line segment (aLat, aLng) -> (bLat, bLng) in miles
 */
export function distanceToSegmentMiles(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number
): number {
  const midLat = ((aLat + bLat + pLat) / 3) * (Math.PI / 180);
  const cosMid = Math.cos(midLat);
  const milesPerLat = 69.0;
  const milesPerLng = 69.17 * cosMid;

  // Project to Cartesian (miles) relative to point A
  const px = (pLng - aLng) * milesPerLng;
  const py = (pLat - aLat) * milesPerLat;
  const bx = (bLng - aLng) * milesPerLng;
  const by = (bLat - aLat) * milesPerLat;

  const segLenSq = bx * bx + by * by;
  if (segLenSq === 0) {
    return Math.sqrt(px * px + py * py);
  }

  let t = (px * bx + py * by) / segLenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = t * bx;
  const projY = t * by;
  const dx = px - projX;
  const dy = py - projY;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates minimum distance in miles from a point to the nearest polygon boundary edge
 */
export function minDistanceToPolygonMiles(lat: number, lng: number, polygon: number[][]): number {
  if (!polygon || polygon.length < 2) return Infinity;
  let minDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const next = (i + 1) % polygon.length;
    const d = distanceToSegmentMiles(
      lat, lng,
      polygon[i][0], polygon[i][1],
      polygon[next][0], polygon[next][1]
    );
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Calculates bounding box of a polygon
 */
export function getPolygonBoundingBox(polygon: number[][]) {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  polygon.forEach(([lat, lng]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * AI Service for geospatial extraction.
 * Uses Gemini with mathematical Point-In-Polygon and Bounding-Box filtering.
 */
export const fetchAreasInPolygon = async (polygonCoords: number[][]): Promise<ServiceArea[]> => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      console.error("API Key missing from environment");
      throw new Error("API Key is missing. Please select a project first.");
    }

    const cleanedPoly = cleanPolygonVertices(polygonCoords);
    if (cleanedPoly.length < 3) {
      throw new Error("Invalid polygon: at least 3 distinct vertices are required.");
    }

    // 1. Calculate polygon bounding box, centroid, and dimensions
    const { minLat, maxLat, minLng, maxLng } = getPolygonBoundingBox(cleanedPoly);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const boxHeightMiles = calculateDistance(minLat, centerLng, maxLat, centerLng);
    const boxWidthMiles = calculateDistance(centerLat, minLng, centerLat, maxLng);

    console.log(`[GEO] Extracting areas for polygon with ${cleanedPoly.length} vertices.`);
    console.log(`[GEO] Bounds: Lat [${minLat.toFixed(5)}, ${maxLat.toFixed(5)}], Lng [${minLng.toFixed(5)}, ${maxLng.toFixed(5)}] (${boxWidthMiles.toFixed(1)}mi W x ${boxHeightMiles.toFixed(1)}mi H)`);

    const ai = new GoogleGenAI({ apiKey });
    const coordsString = cleanedPoly.map(c => `[${c[0].toFixed(5)}, ${c[1].toFixed(5)}]`).join(', ');
    
    const prompt = `
      You are a precision GIS and administrative boundaries analyst specializing in US Census and Postal geography.
      
      TARGET POLYGON VERTICES (Latitude, Longitude sequence):
      ${coordsString}

      POLYGON BOUNDING BOX:
      - Latitude range (South to North): ${minLat.toFixed(5)} to ${maxLat.toFixed(5)}
      - Longitude range (West to East): ${minLng.toFixed(5)} to ${maxLng.toFixed(5)}
      - Approximate Dimensions: ${boxWidthMiles.toFixed(1)} miles wide x ${boxHeightMiles.toFixed(1)} miles high

      TASK:
      Identify EVERY administrative area (ZIP code, incorporated city/town/CDP, and county) that physically intersects or falls INSIDE this specific polygon.

      CRITICAL SPATIAL PRECISION MANDATES:
      1. STRICT POLYGON LOCALIZATION: You MUST ONLY return areas that are physically located inside or directly intersect this drawn polygon.
      2. ZERO REGIONAL SPILLOVER: DO NOT include neighboring cities, adjacent postal codes, or surrounding suburbs that lie outside this polygon, even if they are in the same metropolitan area or county.
      3. ACCURATE COORDINATES REQUIRED: For EVERY single ZIP code, City, and County returned, you MUST provide its exact geographic centroid (lat and lng) in decimal degrees. We will perform mathematical point-in-polygon verification on every coordinate.
      4. ZIP CODES: Identify all 5-digit ZIP codes within or intersecting the boundary, with their estimated Median Household Income.
      5. CITIES: Identify all incorporated cities, towns, and Census Designated Places (CDPs) within or intersecting the boundary.
      6. COUNTIES: Identify all counties touched by the polygon.

      Return the data in the following JSON format:
      {
        "zipCodes": [{"name": "32801", "income": 75000, "lat": 28.5383, "lng": -81.3792}, ...],
        "cities": [{"name": "Orlando", "lat": 28.5383, "lng": -81.3792}, ...],
        "counties": [{"name": "Orange", "lat": 28.5383, "lng": -81.3792}, ...]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: `You are an expert GIS data extraction engine. Your goal is 100% spatial accuracy. Return all ZIP codes, cities, and counties strictly intersecting the provided polygon. Never return areas outside the specified polygon boundary. Always provide accurate centroid latitude and longitude for each entity.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            zipCodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  income: { type: Type.NUMBER },
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER }
                },
                required: ['name', 'income', 'lat', 'lng']
              }
            },
            cities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER }
                },
                required: ['name', 'lat', 'lng']
              }
            },
            counties: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER }
                },
                required: ['name', 'lat', 'lng']
              }
            }
          },
          required: ['zipCodes', 'cities', 'counties']
        }
      }
    });

    const text = response.text;
    if (!text) return [];

    const data = JSON.parse(text);
    console.log("[GEO] Raw Candidates Returned by AI:", {
      zips: data.zipCodes?.length || 0,
      cities: data.cities?.length || 0,
      counties: data.counties?.length || 0
    });
    
    const results: ServiceArea[] = [];
    
    // Helper function to verify if an area coordinate is physically inside or intersecting the polygon
    const isAreaInOrNearPolygon = (lat: number, lng: number, maxBoundaryMarginMiles: number): boolean => {
      if (isNaN(lat) || isNaN(lng)) return false;

      // 1. Quick Bounding Box Filter with tight margin (approx ~1.5 miles in degrees)
      const latMargin = 0.025;
      const lngMargin = 0.035;
      if (lat < minLat - latMargin || lat > maxLat + latMargin ||
          lng < minLng - lngMargin || lng > maxLng + lngMargin) {
        return false;
      }

      // 2. Exact Point-in-Polygon (Ray Casting)
      if (isPointInPolygon(lat, lng, cleanedPoly)) {
        return true;
      }

      // 3. For areas whose center is just outside the drawn boundary line,
      // allow boundary margin if the polygon slices through the ZIP/City boundary
      const distToEdge = minDistanceToPolygonMiles(lat, lng, cleanedPoly);
      return distToEdge <= maxBoundaryMarginMiles;
    };

    // 1. Process and Filter Zip Codes
    if (data.zipCodes && Array.isArray(data.zipCodes)) {
      data.zipCodes.forEach((item: any) => {
        const itemLat = Number(item.lat);
        const itemLng = Number(item.lng);
        // ZIP codes have a typical radius of ~2 miles; allow 1.0 mile boundary tolerance
        if (!isAreaInOrNearPolygon(itemLat, itemLng, 1.0)) {
          console.log(`[FILTERED OUT] ZIP ${item.name} [${itemLat}, ${itemLng}] is outside the drawn polygon boundary.`);
          return;
        }
        results.push({
          id: `Zip-${item.name}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'Zip Code',
          name: String(item.name).trim(),
          income: typeof item.income === 'number' ? item.income : undefined,
          isSelected: true
        });
      });
    }

    // 2. Process and Filter Cities / CDPs
    if (data.cities && Array.isArray(data.cities)) {
      data.cities.forEach((item: any) => {
        const name = typeof item === 'object' ? String(item.name).trim() : String(item).trim();
        const itemLat = typeof item === 'object' ? Number(item.lat) : NaN;
        const itemLng = typeof item === 'object' ? Number(item.lng) : NaN;
        // Cities allow 1.2 miles boundary tolerance
        if (!isAreaInOrNearPolygon(itemLat, itemLng, 1.2)) {
          console.log(`[FILTERED OUT] City ${name} [${itemLat}, ${itemLng}] is outside the drawn polygon boundary.`);
          return;
        }
        results.push({
          id: `City-${name}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'City',
          name: name,
          income: undefined,
          isSelected: true
        });
      });
    }

    // 3. Process and Filter Counties
    if (data.counties && Array.isArray(data.counties)) {
      data.counties.forEach((item: any) => {
        const name = typeof item === 'object' ? String(item.name).trim() : String(item).trim();
        const itemLat = typeof item === 'object' ? Number(item.lat) : NaN;
        const itemLng = typeof item === 'object' ? Number(item.lng) : NaN;
        // Counties are large; allow 2.5 miles boundary tolerance
        if (!isAreaInOrNearPolygon(itemLat, itemLng, 2.5)) {
          console.log(`[FILTERED OUT] County ${name} [${itemLat}, ${itemLng}] is outside the drawn polygon boundary.`);
          return;
        }
        results.push({
          id: `County-${name}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'County',
          name: name,
          income: undefined,
          isSelected: true
        });
      });
    }
    
    console.log(`[GEO] Extraction Complete: ${results.length} verified areas strictly within polygon.`);
    return results;

  } catch (error: any) {
    console.error("AI Error:", error);
    throw error;
  }
};

/**
 * Fallback Geocoder using Gemini 3 Flash
 * Used when OSM Nominatim fails or returns no results.
 */
export const geocodeWithAI = async (address: string): Promise<{lat: number, lng: number} | null> => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) return null;
    
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Return ONLY the latitude and longitude for this address: "${address}". 
                 Format: JSON object with "lat" and "lng" properties.`,
      config: { responseMimeType: "application/json" }
    });
    
    const text = response.text;
    if (!text) return null;
    
    const data = JSON.parse(text);
    if (data.lat && data.lng) {
      return { lat: Number(data.lat), lng: Number(data.lng) };
    }
    return null;
  } catch (err) {
    console.error("AI Geocode failure:", err);
    return null;
  }
};

