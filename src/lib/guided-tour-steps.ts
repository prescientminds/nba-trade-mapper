import type { TourStep } from '@/lib/tour-store';

export const HARDEN_TRADE_ID = 'f696d8e9-4d51-4130-908e-4d028dc820ae';

/**
 * Main guided tour — walks through the Harden-to-Houston trade.
 * Interactive steps (waitFor) require the user to click the target element.
 * Passive steps advance with Next/Back.
 */
export const GUIDED_TOUR_STEPS: TourStep[] = [
  // 1. Expand the collapsed trade
  {
    target: 'trade-plus',
    title: 'EXPAND THE TRADE',
    content: 'Click + to see the full breakdown of the 2012 James Harden trade.',
    placement: 'bottom',
    waitFor: 'trade-expanded',
    waitLabel: 'Click + to expand',
  },
  // 2. Trade score
  {
    target: 'trade-score',
    title: 'TRADE SCORE',
    content: 'Each side is scored by Win Shares — a stat measuring total impact on winning, accumulated over every season the player spent with the new team. Houston received 153 WS. OKC received 14.',
    placement: 'bottom',
  },
  // 3. Salary committed
  {
    target: 'trade-salary',
    title: 'SALARY COMMITTED',
    content: 'Total future salary each team took on. Click the amount to see a per-player salary breakdown.',
    placement: 'bottom',
  },
  // 4. Click player name for inline stats
  {
    target: 'trade-player',
    title: 'PLAYER STATS',
    content: 'Click any player name to see their season-by-season stats from this team stint.',
    placement: 'bottom',
    waitFor: 'inline-stats-opened',
    waitLabel: 'Click a player name',
  },
  // 5. Season breakdown — accolades + playoff badges
  {
    target: 'trade-player',
    title: 'SEASONS, ACCOLADES & PLAYOFFS',
    content: 'Each row is a season. Gold badges are accolades (MVP, All-Star, All-NBA). Colored pills show how far the team went in the playoffs.',
    placement: 'bottom',
  },
  // 6. Follow the path
  {
    target: 'trade-path',
    title: 'FOLLOW THE PATH',
    content: 'Click Path → to trace this player\'s full career journey — every team, every trade.',
    placement: 'bottom',
    waitFor: 'path-started',
    waitLabel: 'Click Path →',
  },
  // 7. Stint cards
  {
    target: 'stint-card',
    title: 'CAREER JOURNEY',
    content: 'Each card is one team stint with averaged stats and total Win Shares. Follow the chain to see every stop.',
    placement: 'bottom',
  },
  // 8. Stint season detail
  {
    target: 'stint-seasons',
    title: 'EXPAND SEASONS',
    content: 'Click to see season-by-season detail — stats, accolades, and playoff results for this stint.',
    placement: 'bottom',
    waitFor: 'stint-expanded',
    waitLabel: 'Click to expand',
  },
  // 9. Follow arrows
  {
    target: 'follow-next',
    title: 'FOLLOW THE ARROWS',
    content: 'Click the arrows to hop between stops on the player\'s journey. The map scrolls to follow.',
    placement: 'top',
    waitFor: 'follow-advanced',
    waitLabel: 'Click ▼ Next',
  },
  // 10. Toolbar expand
  {
    target: 'toolbar-expand',
    title: 'EXPAND THE WEB',
    content: 'Click Expand to reveal connected trades — the deals that rippled out from this one.',
    placement: 'bottom',
  },
  // 11. Toolbar reduce
  {
    target: 'toolbar-reduce',
    title: 'REDUCE',
    content: 'Peel back the outermost layer of nodes to simplify the view.',
    placement: 'bottom',
  },
  // 12. Skins
  {
    target: 'toolbar-skins',
    title: 'VISUAL SKINS',
    content: 'Switch between Classic, Holographic, Inside Stuff, and NBA Jam.',
    placement: 'bottom',
  },
  // 13. Share
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
