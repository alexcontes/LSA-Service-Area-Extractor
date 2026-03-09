
export interface ServiceArea {
  id: string;
  type: 'Zip Code' | 'City' | 'County';
  name: string;
  state?: string;
  stateCode?: string;
  income?: number;
  isSelected: boolean;
}

export interface GeoapifyResult {
  postcode?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  geometry?: any;
}

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
