type GtagParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (cmd: string, event: string, params?: GtagParams) => void;
  }
}

export function track(event: string, params?: GtagParams) {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', event, params);
}
