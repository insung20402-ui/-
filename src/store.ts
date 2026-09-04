import { create } from "zustand";
import { DEFAULT_MANUAL_TRANSFORM, ImageTransform } from "./imageProcessing";

export interface KeyImageState {
  src: string; // 원본 사진 dataURL
  transform: ImageTransform;
}

export interface KeyCustomState {
  color: string;
  image?: KeyImageState;
}

export const DEFAULT_KEYCAP_COLOR = "#3a3d46";
export const DEFAULT_LEGEND_COLOR = "#e7e7ea";

export type KeyMap = Record<string, KeyCustomState>;

interface StoreState {
  keys: KeyMap;
  selectedKeyId: string | null;
  multiSelectIds: string[];
  legendColor: string;
  keycapProfile: "rounded" | "flat";

  selectKey: (id: string, additive?: boolean) => void;
  clearSelection: () => void;

  setKeyImage: (id: string, src: string, transform: ImageTransform) => void;
  updateTransform: (id: string, partial: Partial<ImageTransform>) => void;
  clearKeyImage: (id: string) => void;
  setKeyColor: (id: string, color: string) => void;

  applyImageToKeys: (sourceId: string, targetIds: string[]) => void;
  setLegendColor: (color: string) => void;

  exportDesign: () => string;
  importDesign: (json: string) => void;
  resetAll: () => void;
}

function getOrDefault(keys: KeyMap, id: string): KeyCustomState {
  return keys[id] ?? { color: DEFAULT_KEYCAP_COLOR };
}

export const useKeycapStore = create<StoreState>((set, get) => ({
  keys: {},
  selectedKeyId: null,
  multiSelectIds: [],
  legendColor: DEFAULT_LEGEND_COLOR,
  keycapProfile: "rounded",

  selectKey: (id, additive) =>
    set((state) => {
      if (additive && state.selectedKeyId) {
        // 여러 키를 함께 선택할 때는 처음 선택한 "기준 키"를 유지하고
        // 새로 클릭한 키는 대상 목록에만 추가/제거합니다.
        const exists = state.multiSelectIds.includes(id);
        const nextMulti = exists ? state.multiSelectIds.filter((k) => k !== id) : [...state.multiSelectIds, id];
        return { selectedKeyId: state.selectedKeyId, multiSelectIds: nextMulti };
      }
      return { selectedKeyId: id, multiSelectIds: [id] };
    }),

  clearSelection: () => set({ selectedKeyId: null, multiSelectIds: [] }),

  setKeyImage: (id, src, transform) =>
    set((state) => ({
      keys: {
        ...state.keys,
        [id]: { ...getOrDefault(state.keys, id), image: { src, transform } },
      },
    })),

  updateTransform: (id, partial) =>
    set((state) => {
      const current = state.keys[id];
      if (!current?.image) return state;
      return {
        keys: {
          ...state.keys,
          [id]: {
            ...current,
            image: { ...current.image, transform: { ...current.image.transform, ...partial } },
          },
        },
      };
    }),

  clearKeyImage: (id) =>
    set((state) => {
      const current = getOrDefault(state.keys, id);
      const { image, ...rest } = current;
      return { keys: { ...state.keys, [id]: rest } };
    }),

  setKeyColor: (id, color) =>
    set((state) => ({
      keys: { ...state.keys, [id]: { ...getOrDefault(state.keys, id), color } },
    })),

  applyImageToKeys: (sourceId, targetIds) =>
    set((state) => {
      const source = state.keys[sourceId];
      if (!source?.image) return state;
      const nextKeys = { ...state.keys };
      targetIds.forEach((id) => {
        if (id === sourceId) return;
        nextKeys[id] = {
          ...getOrDefault(state.keys, id),
          image: { src: source.image!.src, transform: { ...source.image!.transform } },
        };
      });
      return { keys: nextKeys };
    }),

  setLegendColor: (color) => set({ legendColor: color }),

  exportDesign: () => {
    const { keys, legendColor, keycapProfile } = get();
    return JSON.stringify({ version: 1, keys, legendColor, keycapProfile }, null, 2);
  },

  importDesign: (json) => {
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object" && parsed.keys) {
        set({
          keys: parsed.keys,
          legendColor: parsed.legendColor ?? DEFAULT_LEGEND_COLOR,
          keycapProfile: parsed.keycapProfile ?? "rounded",
        });
      }
    } catch (e) {
      console.error("디자인 불러오기 실패:", e);
    }
  },

  resetAll: () => set({ keys: {}, selectedKeyId: null, multiSelectIds: [] }),
}));

export function makeDefaultTransform(): ImageTransform {
  return {
    ...DEFAULT_MANUAL_TRANSFORM,
    brightness: 1,
    contrast: 1,
    saturate: 1,
  };
}
