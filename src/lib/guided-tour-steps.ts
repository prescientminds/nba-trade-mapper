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
  // 1. Expand the collapsed trade — whole card visible
  {
    target: 'trade-card',
    title: 'EXPAND THE TRADE',
    content: 'Click the + button in the top right to open the 2012 James Harden trade.',
    placement: 'bottom',
    waitFor: 'trade-expanded',
    waitLabel: 'Click + to expand',
  },
  // 2. Trade score — spotlight the score section
  {
    target: 'trade-score',
    title: 'TRADE SCORE',
    content: 'Each side is scored by Win Shares — total impact on winning across every season with the new team. Houston received 153 WS. OKC received 14.',
    placement: 'bottom',
  },
  // 3. Salary — interactive, click to see per-player breakdown
  {
    target: 'trade-card',
    title: 'SALARY BREAKDOWN',
    content: 'Click the salary amount next to either team name to see what each player was paid.',
    placement: 'bottom',
    waitFor: 'salary-expanded',
    waitLabel: 'Click a salary amount',
  },
  // 4. Click player name for inline stats
  {
    target: 'trade-card',
    title: 'PLAYER STATS',
    content: 'Click any player name to see their season-by-season stats, accolades, and playoff results.',
    placement: 'bottom',
    waitFor: 'inline-stats-opened',
    waitLabel: 'Click a player name',
  },
  // 5. Accolades + playoffs explanation (passive — user sees the inline stats)
  {
    target: 'trade-card',
    title: 'ACCOLADES & PLAYOFFS',
    content: 'Gold badges are accolades (MVP, All-Star, All-NBA). If a player had a standout playoff game, it\'s highlighted with a peak Game Score. Click any playoff badge to see full series stats.',
    placement: 'bottom',
  },
  // 6. Follow the path — whole card visible so Path → button is accessible
  {
    target: 'trade-card',
    title: 'FOLLOW THE PATH',
    content: 'Click Path → next to a player name to trace their full career journey — every team, every trade.',
    placement: 'bottom',
    waitFor: 'path-started',
    waitLabel: 'Click Path →',
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
    placement: 'bottom',
  },
  // 10. Share
  {
    target: 'toolbar-share',
    title: 'SHARE',
    content: 'Copy a shareable link or create a custom trade card to share on social media.',
    placement: 'bottom',
  },
];

/**
 * Share modal tour — auto-starts the first time the card creator opens.
 */
export const SHARE_TOUR_STEPS: TourStep[] = [
  {
    target: 'share-card-type',
    title: 'CARD TYPE',
    content: 'Choose Score Card (stats comparison) or Grade Card (letter grade).',
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
    target: 'share-actions',
    title: 'SHARE IT',
    content: 'Download, copy to clipboard, or share directly.',
    placement: 'top',
  },
];
