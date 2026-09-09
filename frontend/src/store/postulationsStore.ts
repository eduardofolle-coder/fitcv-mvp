import { create } from 'zustand';

export interface Postulation {
  id: string;
  offerId: string;
  status: 'DRAFT' | 'APPLIED' | 'REJECTED' | 'ACCEPTED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  notes: string;
  createdAt: string;
  updatedAt: string;
  adaptedCvId?: string;
  atsScore?: number;
}

interface PostulationsStore {
  postulations: Postulation[];
  selectedPostulation: Postulation | null;
  filters: {
    status?: string;
    priority?: string;
    search?: string;
  };
  setPostulations: (postulations: Postulation[]) => void;
  addPostulation: (postulation: Postulation) => void;
  updatePostulation: (id: string, updates: Partial<Postulation>) => void;
  deletePostulation: (id: string) => void;
  setSelectedPostulation: (postulation: Postulation | null) => void;
  setFilters: (filters: any) => void;
}

export const usePostulationsStore = create<PostulationsStore>((set) => ({
  postulations: [],
  selectedPostulation: null,
  filters: {},

  setPostulations: (postulations) => set({ postulations }),

  addPostulation: (postulation) =>
    set((state) => ({
      postulations: [postulation, ...state.postulations]
    })),

  updatePostulation: (id, updates) =>
    set((state) => ({
      postulations: state.postulations.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
      selectedPostulation: state.selectedPostulation?.id === id
        ? { ...state.selectedPostulation, ...updates }
        : state.selectedPostulation
    })),

  deletePostulation: (id) =>
    set((state) => ({
      postulations: state.postulations.filter((p) => p.id !== id),
      selectedPostulation:
        state.selectedPostulation?.id === id ? null : state.selectedPostulation
    })),

  setSelectedPostulation: (postulation) => set({ selectedPostulation: postulation }),

  setFilters: (filters) => set({ filters })
}));
