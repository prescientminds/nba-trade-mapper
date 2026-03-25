import type { TourStep } from '@/lib/tour-store';

export const HARDEN_TRADE_ID = 'f696d8e9-4d51-4130-908e-4d028dc820ae';

/**
 * Main guided tour — walks through the Harden-to-Houston trade.
 * Interactive steps (waitFor) require the user to click the target element.
 * Passive steps advance with Next/Back.
 *
 * Most steps spotlight the whole trade card so the user can see context.
 * After each interactive step, the overlay hides for 1.2s (reveal phase)
 * so the user sees the result of their action.
 */
export const GUIDED_TOUR_STEPS: TourStep[] = [
  // 1. Expand the collapsed trade — target the + button specifically
  {
    target: 'trade-plus',
    title: 'EXPAND THE TRADE',
    content: 'Click the + button to open the 2012 James Harden trade.',
    placement: 'bottom',
    waitFor: 'trade-expanded',
    waitLabel: 'Click + to expand',
  },
  // 2. Trade score — spotlight the score section
  {
    target: 'trade-score',
    title: 'TRADE SCORE',
    content: 'Each side is scored by Win Shares — total impact on winning across every season with the new team. Houston received 153 WS. OKC received 67.',
    placement: 'bottom',
  },
  // 3. Salary — target the salary number
  {
    target: 'trade-salary',
    title: 'SALARY BREAKDOWN',
    content: 'Click the salary amount to see what each player was paid.',
    placement: 'bottom',
    waitFor: 'salary-expanded',
    waitLabel: 'Click a salary amount',
  },
  // 4. Click player name for inline stats
  {
    target: 'trade-player',
    title: 'PLAYER STATS',
    content: 'Click any player name to see their season-by-season stats, accolades, and playoff results.',
    placement: 'bottom',
    waitFor: 'inline-stats-opened',
    waitLabel: 'Click a player name',
  },
  // 5. WS vs Salary chart — click the WS column header to toggle
  {
    target: 'tour-ws-header',
    title: 'WIN SHARES vs SALARY',
    content: 'Click the WS column header to chart Win Shares against salary across every season. Orange is production, teal is cost.',
    placement: 'bottom',
    waitFor: 'ws-chart-opened',
    waitLabel: 'Click WS',
    zoom: 1.8,
  },
  // 6. Show the chart — passive, just center on it
  {
    target: 'tour-ws-chart',
    title: 'VALUE OVER TIME',
    content: 'When the lines diverge — production up, salary flat — that\'s where a trade paid off. When salary outpaces Win Shares, the contract hurt.',
    placement: 'top',
    zoom: 1.2,
  },
  // 7. Accolades + playoffs explanation — zoom into the richest season row
  {
    target: 'tour-accolades-row',
    title: 'ACCOLADES & PLAYOFFS',
    content: 'Gold badges are accolades (MVP, All-Star, All-NBA). Playoff badges show series results. Click any playoff badge to see full series stats.',
    placement: 'bottom',
    zoom: 1.8,
  },
  // 6. Follow the path — zoom into the Path button
  {
    target: 'trade-path',
    title: 'FOLLOW THE PATH',
    content: 'Click Path to trace their full career journey — every team, every trade.',
    placement: 'bottom',
    waitFor: 'path-started',
    waitLabel: 'Click Path →',
    zoom: 1.8,
  },
  // 7. Career journey — stint cards appear
  {
    target: 'stint-card',
    title: 'CAREER JOURNEY',
    content: 'Each card is one team stint with averaged stats and total Win Shares. Follow the chain to see every stop.',
    placement: 'bottom',
  },
  // 8. Follow arrows
  {
    target: 'follow-next',
    title: 'FOLLOW THE ARROWS',
    content: 'Click the yellow arrows to hop between stops on the player\'s journey. The map scrolls to follow.',
    placement: 'top',
    waitFor: 'follow-advanced',
    waitLabel: 'Click ▼ Next',
  },
  // 9. Skins
  {
    target: 'toolbar-skins',
    title: 'VISUAL SKINS',
    content: 'Switch between Classic, Holographic, Inside Stuff, and NBA Jam.',
    placement: 'top',
  },
  // 10. Share — target the SHARE button on the trade node
  {
    target: 'trade-share',
    title: 'CREATE A SHARE CARD',
    content: 'Click SHARE to build a custom trade card you can send to anyone.',
    placement: 'bottom',
    waitFor: 'share-opened',
    waitLabel: 'Click SHARE',
  },
  // ── Share card creation flow ──
  {
    target: 'share-card-type',
    title: 'CARD TYPE',
    content: 'Score Card compares stats side by side. Grade Card gives a letter grade.',
    placement: 'bottom',
  },
  {
    target: 'share-skin',
    title: 'SKIN',
    content: 'Pick a visual style for the card.',
    placement: 'bottom',
  },
  {
    target: 'share-players',
    title: 'PLAYERS',
    content: 'Select which players appear on the card.',
    placement: 'bottom',
  },
  {
    target: 'share-caption',
    title: 'HOT TAKE',
    content: 'Add your take on the trade.',
    placement: 'bottom',
  },
  {
    target: 'share-spotlight',
    title: 'SPOTLIGHT',
    content: 'Toggle which stats to highlight on the card.',
    placement: 'bottom',
  },
  {
    target: 'share-preview',
    title: 'THE CIPOLLONE STANDARD',
    content: 'Every trade gets a verdict — from balanced to catastrophic. The worst trades don\'t meet the Cipollone Standard.',
    placement: 'top',
  },
  {
    target: 'share-actions',
    title: 'SHARE IT',
    content: 'Download, copy to clipboard, or share directly.',
    placement: 'top',
  },
];
