import { create } from 'zustand';

export interface Farm {
  id: string;
  farm_name: string;
  owner_name: string;
  state: string;
  district: string;
  phone: string;
  farm_type: 'independent' | 'contract';
  upi_id: string | null;
  heat_stress_threshold_celsius?: number | null;
}

interface FarmState {
  currentFarm: Farm | null;
  setCurrentFarm: (farm: Farm | null) => void;
}

export const useFarmStore = create<FarmState>((set) => ({
  currentFarm: null,
  setCurrentFarm: (farm) => set({ currentFarm: farm }),
}));
