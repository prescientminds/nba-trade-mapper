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
    placement: 'top',
    waitFor: 'salary-expanded',
    waitLabel: 'Click a salary amount',
    zoom: 2,
  },
  // 4. Click player name for inline stats
  {
    target: 'trade-player',
    title: 'PLAYER STATS',
    content: 'Click any player name to see their season-by-season stats, accolades, and playoff results.',
    placement: 'top',
    waitFor: 'inline-stats-opened',
    waitLabel: 'Click a player name',
    zoom: 2,
  },
  // 5. WS vs Salary chart — click the WS column header to toggle
  {
    target: 'tour-ws-header',
    title: 'WIN SHARES vs SALARY',
    content: 'Click the WS column header to chart Win Shares against salary across every season. Orange is production, teal is cost.',
    placement: 'top',
    waitFor: 'ws-chart-opened',
    waitLabel: 'Click WS',
    zoom: 2,
  },
  // 6. Show the chart — passive, just center on it
  {
    target: 'tour-ws-chart',
    title: 'VALUE OVER TIME',
    content: 'When the lines diverge — production up, salary flat — that\'s where a trade paid off. When salary outpaces Win Shares, the contract hurt.',
    placement: 'top',
    zoom: 1.5,
  },
  // 7. Accolades + playoffs explanation — zoom into the richest season row
  {
    target: 'tour-accolades-row',
    title: 'ACCOLADES & PLAYOFFS',
    content: 'Gold badges are accolades (MVP, All-Star, All-NBA). Playoff badges show series results. Click any playoff badge to see full series stats.',
    placement: 'top',
    zoom: 2,
  },
  // 8. Follow the path — zoom into the Path button
  {
    target: 'trade-path',
    title: 'FOLLOW THE PATH',
    content: 'Click Path to trace their full career journey — every team, every trade.',
    placement: 'top',
    waitFor: 'path-started',
    waitLabel: 'Click Path →',
    zoom: 2,
  },
  // 7. Career journey — follow the arrows to hop between stints
  {
    target: 'follow-next',
    title: 'CAREER JOURNEY',
    content: 'Each card is a team stint. Click the arrow to follow the career — the map scrolls with you.',
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
  // First: show the card preview so user sees what they're building
  {
    target: 'share-preview',
    title: 'YOUR TRADE CARD',
    content: 'This is what gets shared. Every control below changes the card in real time.',
    placement: 'bottom',
  },
  {
    target: 'share-card-type',
    title: 'CARD TYPE',
    content: 'Score Card compares stats side by side. Grade Card gives a letter grade.',
    placement: 'top',
  },
  {
    target: 'share-skin',
    title: 'SKIN',
    content: 'Classic, Prizm, Noir, or Retro — pick a look for the card.',
    placement: 'top',
  },
  {
    target: 'share-players',
    title: 'PLAYERS',
    content: 'Select which players appear on the card.',
    placement: 'top',
  },
  {
    target: 'share-caption',
    title: 'THE CIPOLLONE STANDARD',
    content: 'Every card gets a verdict headline — from balanced to catastrophic. The worst trades don\'t meet the Cipollone Standard. Add your own take here.',
    placement: 'top',
  },
  {
    target: 'share-spotlight',
    title: 'SPOTLIGHT',
    content: 'Toggle which stats to highlight on the card.',
    placement: 'top',
  },
  {
    target: 'share-actions',
    title: 'SHARE IT',
    content: 'Download, copy to clipboard, or share directly.',
    placement: 'top',
  },
];
