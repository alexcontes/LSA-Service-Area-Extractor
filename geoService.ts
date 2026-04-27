import { GoogleGenAI, Type } from "@google/genai";
import { ServiceArea } from './types';

/**
 * AI Service for geospatial extraction.
 * Optimized for high-speed ZIP/City/County identification.
 */
export const fetchAreasInPolygon = async (polygonCoords: number[][]): Promise<ServiceArea[]> => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      console.error("API Key missing from environment");
      throw new Error("API Key is missing. Please select a project first.");
    }

    console.log("Starting AI Extraction with model: gemini-3-flash-preview");
    const ai = new GoogleGenAI({ apiKey });
    const coordsString = polygonCoords.map(c => `[${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`).join(', ');
    
    const prompt = `
      You are a precision geospatial data engineer specializing in US Census and postal data.
      
      BOUNDARY (Polygon Coordinates): ${coordsString}

      TASK:
      Identify EVERY administrative area (Zip, City, County) that intersects this boundary.
      
      CRITICAL REQUIREMENTS:
      1. SPATIAL PRECISION: Only include areas that have a meaningful intersection with the polygon. 
         - IGNORE areas that only have a negligible sliver (e.g., < 5% of their area or unpopulated land) touching the boundary. 
         - This is critical to prevent "Boundary Creep" where a tiny touch triggers a massive rural service area.
      2. ZIP CODES: Identify every 5-digit ZIP code. For each, provide the estimated Median Household Income.
      3. CITIES/TOWNS/CDPs: Include incorporated cities and Census Designated Places. Ensure you have the correct state.
      4. COUNTIES: Identify all counties with significant portions inside the boundary.
      5. DUPLICATION: Return each unique area only once.

      Return the data in the following JSON format:
      {
        "zipCodes": [{"name": "32801", "stateCode": "FL", "state": "Florida", "income": 75000}, ...],
        "cities": [{"name": "Orlando", "stateCode": "FL", "state": "Florida"}, ...],
        "counties": [{"name": "Orange", "stateCode": "FL", "state": "Florida"}]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a specialized geospatial data extractor focused on high accuracy and spatial relevance. Your goal is to return EVERY ZIP code, city, and county that intersects the provided boundary. CRITICAL: To prevent over-targeting, if an area only intersects by a tiny sliver that is likely unpopulated or represents less than 5% of its total area, OMIT IT. Always include full state name and code for every item.",
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
                  state: { type: Type.STRING },
                  stateCode: { type: Type.STRING },
                  income: { type: Type.NUMBER }
                },
                required: ['name', 'state', 'stateCode', 'income']
              }
            },
            cities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  state: { type: Type.STRING },
                  stateCode: { type: Type.STRING }
                },
                required: ['name', 'state', 'stateCode']
              }
            },
            counties: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  state: { type: Type.STRING },
                  stateCode: { type: Type.STRING }
                },
                required: ['name', 'state', 'stateCode']
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
    console.log("Extracted Data Summary:", {
      zips: data.zipCodes?.length,
      cities: data.cities?.length,
      counties: data.counties?.length
    });
    
    const results: ServiceArea[] = [];

    // Process Zip Codes
    if (data.zipCodes) {
      data.zipCodes.forEach((item: any) => {
        results.push({
          id: `Zip-${item.name}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'Zip Code',
          name: item.name,
          state: item.state,
          stateCode: item.stateCode,
          income: item.income,
          isSelected: true
        });
      });
    }

    // Process Cities
    if (data.cities) {
      data.cities.forEach((item: any) => {
        results.push({
          id: `City-${item.name}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'City',
          name: item.name,
          state: item.state,
          stateCode: item.stateCode,
          income: undefined,
          isSelected: true
        });
      });
    }

    // Process Counties
    if (data.counties) {
      data.counties.forEach((item: any) => {
        results.push({
          id: `County-${item.name}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'County',
          name: item.name,
          state: item.state,
          stateCode: item.stateCode,
          income: undefined,
          isSelected: true
        });
      });
    }
    
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
