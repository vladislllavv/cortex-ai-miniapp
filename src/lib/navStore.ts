import { create } from "zustand";

export type AppTab = "home" | "plan" | "ai" | "more";
export type MoreSubView = null | "settings" | "goals" | "team";

interface NavStore {
  tab: AppTab;
  moreSubView: MoreSubView;
  setTab: (tab: AppTab) => void;
  setMoreSubView: (view: MoreSubView) => void;
  goToMoreSettings: () => void;
  goToMoreTeam: () => void;
}

export const useNavStore = create<NavStore>((set) => ({
  tab: "home",
  moreSubView: null,
  setTab: (tab) => set({ tab }),
  setMoreSubView: (moreSubView) => set({ moreSubView }),
  goToMoreSettings: () => set({ tab: "more", moreSubView: "settings" }),
  goToMoreTeam: () => set({ tab: "more", moreSubView: "team" }),
}));
