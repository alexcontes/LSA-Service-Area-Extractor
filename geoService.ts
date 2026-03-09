import { GoogleGenAI, Type } from "@google/genai";
import { ServiceArea } from './types';

/**
 * AI Service for geospatial extraction.
 * Optimized for high-speed ZIP/City/County identification.
 */
export const fetchAreasInPolygon = async (polygonCoords: number[][]): Promise<ServiceArea[]> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key is missing. Please select a project first.");
    }

    // Fresh instance for every call to ensure correct key context
    const ai = new GoogleGenAI({ apiKey });
    const coordsString = polygonCoords.map(c => `[${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`).join(', ');
    
    const prompt = `
      You are a specialized geospatial data engineer. 
      Boundary Coordinates (Polygon): ${coordsString}

      TASK:
      1. Analyze the area defined by these coordinates.
      2. Extract ALL 5-digit ZIP codes that are inside or touch this boundary.
      3. Identify the major Cities and Counties within the boundary.
      4. For each ZIP code, estimate the Median Household Income.
      5. For each area (Zip, City, County), identify the full State Name (e.g. "Florida") AND the 2-letter State Code (e.g. "FL").
      6. Return ONLY a JSON array of objects.

      Strictly follow this schema:
      - type: "Zip Code" | "City" | "County"
      - name: The 5-digit zip or name
      - state: The full state name (e.g. "Florida")
      - stateCode: The 2-letter state code (e.g. "FL")
      - income: Estimated numeric income (for zip codes)

      Do not include any text before or after the JSON.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['Zip Code', 'City', 'County'] },
              name: { type: Type.STRING },
              state: { type: Type.STRING, description: "Full state name" },
              stateCode: { type: Type.STRING, description: "2-letter state code" },
              income: { type: Type.NUMBER }
            },
            required: ['type', 'name', 'state', 'stateCode'],
            propertyOrdering: ["type", "name", "state", "stateCode", "income"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];

    const results = JSON.parse(text);
    console.log("Extracted Data:", results);
    
    return results.map((item: any) => ({
      id: `${item.type}-${item.name}-${item.stateCode}-${Math.random().toString(36).substr(2, 9)}`,
      type: item.type as 'Zip Code' | 'City' | 'County',
      name: item.name,
      state: item.state,
      stateCode: item.stateCode,
      income: item.income,
      isSelected: true
    }));

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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Return ONLY the latitude and longitude for this address: "${address}". 
                 Format: JSON object with "lat" and "lng" properties.`,
      config: { responseMimeType: "application/json" }
    });
    
    const data = JSON.parse(response.text);
    if (data.lat && data.lng) {
      return { lat: Number(data.lat), lng: Number(data.lng) };
    }
    return null;
  } catch (err) {
    console.error("AI Geocode failure:", err);
    return null;
  }
};
