/**
 * Progressive hint system for first-time users.
 *
 * Six hints fire in sequence. Each appears at the moment the user first
 * encounters that feature, and dismisses when they perform the action.
 * Progress is stored in localStorage so hints never repeat.
 *
 * Hint flow:
 *   1. Search bar (first visit)       → dismissed on first search submit
 *   2. First node on canvas           → dismissed on first node click/expand
 *   3. Path button in expanded trade  → dismissed on first Path click
 *   4. Score bar in expanded trade    → dismissed after 5s or hover
 *   5. + button / expand web          → dismissed on first + click
 *   6. Discovery section              → dismissed on first Explore click
 */

import { create } from 'zustand';

const STORAGE_KEY = 'nba-tm-hints';

function loadStep(): number {
  if (typeof window === 'undefined') return 1;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? parseInt(stored, 10) : 1;
}

function saveStep(step: number) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, String(step));
}

interface HintStore {
  /** The current active hint (1-6), or 7 if all dismissed */
  step: number;
  /** Advance past the given hint step */
  dismiss: (hintStep: number) => void;
  /** Check if a specific hint should show */
  shouldShow: (hintStep: number) => boolean;
}

export const useHints = create<HintStore>((set, get) => ({
  step: loadStep(),

  dismiss: (hintStep: number) => {
    const current = get().step;
    if (hintStep === current) {
      const next = current + 1;
      saveStep(next);
      set({ step: next });
    }
  },

  shouldShow: (hintStep: number) => {
    return get().step === hintStep;
  },
}));
