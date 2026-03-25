'use client';

import { create } from 'zustand';

/**
 * Global tour state — one tour at a time across the entire app.
 *
 * The tour is a linear sequence of steps. Some steps are "passive" (Next/Back
 * navigation) and some are "interactive" (the user must click a specific
 * element to advance). The Tour UI component reads from this store; individual
 * UI components call `advanceIfWaiting(tag)` after the user interacts with a
 * tour-targeted element.
 */

export interface TourStep {
  /** data-tour attribute to spotlight. null = centered modal, no spotlight. */
  target: string | null;
  title: string;
  content: string;
  placement: 'top' | 'bottom';
  /**
   * If set, the step waits for the user to interact with the target element
   * (or any element matching this tag) before advancing. The "Next" button is
   * replaced with a prompt like "Click the + button".
   */
  waitFor?: string;
  /** Label shown instead of "Next" when waitFor is set */
  waitLabel?: string;
  /** Max zoom level for fitView when centering on this step's target node */
  zoom?: number;
}

interface TourState {
  /** Currently active tour ID, or null if no tour is running */
  activeTour: string | null;
  /** Steps for the active tour */
  steps: TourStep[];
  /** Current step index */
  stepIndex: number;
  /** Is the tour showing the welcome prompt? */
  showingWelcome: boolean;
  /** Has the user completed (or skipped) the main guided tour? */
  completed: boolean;
  /** Brief reveal phase — overlay hides so user can see the result of their action */
  revealing: boolean;

  /** Start a tour */
  startTour: (tourId: string, steps: TourStep[], showWelcome?: boolean) => void;
  /** Accept the welcome prompt and begin stepping */
  acceptWelcome: () => void;
  /** Go to next step */
  next: () => void;
  /** Go to previous step */
  back: () => void;
  /** Skip / complete the tour */
  skip: () => void;
  /**
   * Called by interactive elements when the user performs the expected action.
   * If the current step has a `waitFor` matching `tag`, advance to the next step.
   */
  advanceIfWaiting: (tag: string) => void;
  /** Check if a specific tour has been completed (persisted in localStorage) */
  hasCompleted: (tourId: string) => boolean;
}

const STORAGE_PREFIX = 'nba-tm-tour-';

export const useTourStore = create<TourState>((set, get) => ({
  activeTour: null,
  steps: [],
  stepIndex: 0,
  showingWelcome: false,
  completed: false,
  revealing: false,

  startTour: (tourId, steps, showWelcome = false) => {
    set({
      activeTour: tourId,
      steps,
      stepIndex: 0,
      showingWelcome: showWelcome,
      completed: false,
    });
  },

  acceptWelcome: () => {
    set({ showingWelcome: false });
  },

  next: () => {
    const { stepIndex, steps } = get();
    if (stepIndex >= steps.length - 1) {
      get().skip();
    } else {
      set({ stepIndex: stepIndex + 1 });
    }
  },

  back: () => {
    const { stepIndex } = get();
    if (stepIndex > 0) {
      set({ stepIndex: stepIndex - 1 });
    }
  },

  skip: () => {
    const { activeTour } = get();
    if (activeTour) {
      try { localStorage.setItem(STORAGE_PREFIX + activeTour, 'true'); } catch {}
    }
    set({ activeTour: null, steps: [], stepIndex: 0, showingWelcome: false, completed: true });
  },

  advanceIfWaiting: (tag) => {
    const { steps, stepIndex, activeTour, showingWelcome } = get();
    if (!activeTour || showingWelcome) return;
    const current = steps[stepIndex];
    if (current?.waitFor === tag) {
      // Reveal phase: hide overlay so user sees the result of their action
      set({ revealing: true });
      setTimeout(() => {
        set({ revealing: false });
        get().next();
      }, 1200);
    }
  },

  hasCompleted: (tourId) => {
    try { return localStorage.getItem(STORAGE_PREFIX + tourId) === 'true'; } catch { return false; }
  },
}));
