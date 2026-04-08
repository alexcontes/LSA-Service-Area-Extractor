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

    console.log("NEW MODEL - Starting Exhaustive AI Extraction with model: gemini-3.1-pro-preview");
    const ai = new GoogleGenAI({ apiKey });
    const coordsString = polygonCoords.map(c => `[${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`).join(', ');
    
    const prompt = `
      You are a precision geospatial data engineer specializing in US Census and postal data.
      
      BOUNDARY (Polygon Coordinates): ${coordsString}

      TASK:
      Identify EVERY single administrative area that falls within or touches this boundary.
      
      CRITICAL REQUIREMENTS:
      1. UNIVERSAL EXHAUSTIVENESS: You must be 100% exhaustive for the specific area provided. Whether it is a high-density urban center (with 200+ ZIPs) or a sparse rural region (with 5 ZIPs), you MUST identify every single intersection. Do not truncate or summarize.
      2. ZIP CODES: Identify every 5-digit ZIP code. For each, provide the estimated Median Household Income based on latest Census data.
      3. CITIES/TOWNS/CDPs: Include all incorporated cities, towns, and Census Designated Places (CDPs). This is critical for Google Local Services Ads (LSA) targeting.
      4. COUNTIES: Identify all counties touched by the boundary.
      5. GEOSPATIAL PRECISION: Only include areas that actually intersect with the polygon defined by the coordinates.

      Return the data in the following JSON format:
      {
        "zipCodes": [{"name": "32801", "income": 75000}, ...],
        "cities": ["Orlando", "Winter Park", ...],
        "counties": ["Orange", "Seminole", ...]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a specialized geospatial data extractor. Your primary goal is 100% exhaustiveness. You must return EVERY single ZIP code, city, and county that intersects the provided boundary, regardless of how many results there are. Never truncate, summarize, or omit data to save space.",
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
                  income: { type: Type.NUMBER }
                },
                required: ['name', 'income']
              }
            },
            cities: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            counties: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
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
          income: item.income,
          isSelected: true
        });
      });
    }

    // Process Cities
    if (data.cities) {
      data.cities.forEach((name: string) => {
        results.push({
          id: `City-${name}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'City',
          name: name,
          income: undefined,
          isSelected: true
        });
      });
    }

    // Process Counties
    if (data.counties) {
      data.counties.forEach((name: string) => {
        results.push({
          id: `County-${name}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'County',
          name: name,
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
