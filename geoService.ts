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
 * AI Service for geospatial extraction.
 * Optimized for high-speed ZIP/City/County identification with mathematical bounding-box constraints.
 */
export const fetchAreasInPolygon = async (polygonCoords: number[][]): Promise<ServiceArea[]> => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      console.error("API Key missing from environment");
      throw new Error("API Key is missing. Please select a project first.");
    }

    // 1. Calculate the polygon's centroid and maximum radius (boundary) to filter hallucinations
    let centerLat = 0;
    let centerLng = 0;
    polygonCoords.forEach(c => {
      centerLat += c[0];
      centerLng += c[1];
    });
    const avgLat = centerLat / polygonCoords.length;
    const avgLng = centerLng / polygonCoords.length;

    let maxRadiusMiles = 0;
    polygonCoords.forEach(c => {
      const dist = calculateDistance(avgLat, avgLng, c[0], c[1]);
      if (dist > maxRadiusMiles) maxRadiusMiles = dist;
    });

    console.log(`Starting Exhaustive AI Extraction with model gemini-3.1-pro-preview. Centroid: [${avgLat.toFixed(6)}, ${avgLng.toFixed(6)}], Bounding Radius: ${maxRadiusMiles.toFixed(2)} miles`);
    const ai = new GoogleGenAI({ apiKey });
    const coordsString = polygonCoords.map(c => `[${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`).join(', ');
    
    const prompt = `
      You are a precision geospatial data engineer specializing in US Census and postal data.
      
      BOUNDARY (Polygon Coordinates): ${coordsString}
      ESTIMATED SEARCH RADIUS: ${maxRadiusMiles.toFixed(2)} miles around the center point Point[${avgLat.toFixed(6)}, ${avgLng.toFixed(6)}]

      TASK:
      Identify EVERY single administrative area (ZIP code, city/town, county) that falls within or touches this boundary.
      
      CRITICAL REQUIREMENTS & CONSTRAINTS:
      1. UNIVERSAL EXHAUSTIVENESS: Identify 100% of the areas that meet the criteria. Never truncate or omit any results.
      2. STRICT SPATIAL PRECISION: Do NOT include any area whose center centroid is further than ${maxRadiusMiles.toFixed(2)} miles from our center point [${avgLat.toFixed(2)}, ${avgLng.toFixed(2)}]. You must be highly selective to prevent wider regional leakage.
      3. COORDINATE LABELS: For each ZIP code, city/town, and county, you MUST provide its center/centroid coordinates (latitude and longitude) for verification.
      4. ZIP CODES: Identify every 5-digit ZIP code. For each, estimate the Median Household Income.
      5. CITIES: Include all incorporated cities, towns, and Census Designated Places (CDPs).
      6. COUNTIES: Identify all counties intersecting the boundary.

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
        systemInstruction: `You are a specialized geospatial data extractor. Your primary goal is 100% exhaustiveness within the strictly defined spatial bounds. You must return EVERY single ZIP code, city, and county that intersects the provided boundary, along with its estimated centroid coordinates (lat/lng). NEVER include areas far outside the requested ${(maxRadiusMiles).toFixed(1)} miles radius.`,
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
    console.log("Extracted Data Raw Count:", {
      zips: data.zipCodes?.length,
      cities: data.cities?.length,
      counties: data.counties?.length
    });
    
    const results: ServiceArea[] = [];
    
    // We allow a gentle 15% buffer above the bounding radius to ensure we don't accidentally discard large ZIP codes or cities that partially cross our boundary
    const maxBoundaryWithBuffer = maxRadiusMiles * 1.15;

    // Process Zip Codes with strict physical radius filter
    if (data.zipCodes) {
      data.zipCodes.forEach((item: any) => {
        const itemLat = Number(item.lat);
        const itemLng = Number(item.lng);
        if (!isNaN(itemLat) && !isNaN(itemLng)) {
          const dist = calculateDistance(avgLat, avgLng, itemLat, itemLng);
          if (dist > maxBoundaryWithBuffer) {
            console.log(`[FILTERED OUT] ZIP ${item.name} is ${dist.toFixed(2)} miles away (radius limit with buffer: ${maxBoundaryWithBuffer.toFixed(2)} miles)`);
            return;
          }
        }
        results.push({
          id: `Zip-${item.name}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'Zip Code',
          name: item.name,
          income: item.income,
          isSelected: true
        });
      });
    }

    // Process Cities with strict physical radius filter
    if (data.cities) {
      data.cities.forEach((item: any) => {
        const name = typeof item === 'object' ? item.name : item;
        const itemLat = typeof item === 'object' ? Number(item.lat) : NaN;
        const itemLng = typeof item === 'object' ? Number(item.lng) : NaN;
        if (!isNaN(itemLat) && !isNaN(itemLng)) {
          const dist = calculateDistance(avgLat, avgLng, itemLat, itemLng);
          if (dist > maxBoundaryWithBuffer) {
            console.log(`[FILTERED OUT] City ${name} is ${dist.toFixed(2)} miles away (radius limit with buffer: ${maxBoundaryWithBuffer.toFixed(2)} miles)`);
            return;
          }
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

    // Process Counties with strict physical radius filter
    if (data.counties) {
      data.counties.forEach((item: any) => {
        const name = typeof item === 'object' ? item.name : item;
        const itemLat = typeof item === 'object' ? Number(item.lat) : NaN;
        const itemLng = typeof item === 'object' ? Number(item.lng) : NaN;
        if (!isNaN(itemLat) && !isNaN(itemLng)) {
          const dist = calculateDistance(avgLat, avgLng, itemLat, itemLng);
          if (dist > maxBoundaryWithBuffer) {
            console.log(`[FILTERED OUT] County ${name} is ${dist.toFixed(2)} miles away (radius limit with buffer: ${maxBoundaryWithBuffer.toFixed(2)} miles)`);
            return;
          }
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
    
    console.log(`After mathematical physical filtering, selected: ${results.length} areas`);
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
