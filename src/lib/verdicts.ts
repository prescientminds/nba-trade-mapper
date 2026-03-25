// ── Trade verdict headlines ──
// Deterministic random selection within tier, seeded by trade identity.

const NICK: Record<string, string> = {
  ATL: 'HAWKS', BOS: 'CELTICS', BKN: 'NETS', CHA: 'HORNETS',
  CHI: 'BULLS', CLE: 'CAVALIERS', DAL: 'MAVERICKS', DEN: 'NUGGETS',
  DET: 'PISTONS', GSW: 'WARRIORS', HOU: 'ROCKETS', IND: 'PACERS',
  LAC: 'CLIPPERS', LAL: 'LAKERS', MEM: 'GRIZZLIES', MIA: 'HEAT',
  MIL: 'BUCKS', MIN: 'TIMBERWOLVES', NOP: 'PELICANS', NYK: 'KNICKS',
  OKC: 'THUNDER', ORL: 'MAGIC', PHI: '76ERS', PHX: 'SUNS',
  POR: 'BLAZERS', SAC: 'KINGS', SAS: 'SPURS', TOR: 'RAPTORS',
  UTA: 'JAZZ', WAS: 'WIZARDS',
  SEA: 'SUPERSONICS', NJN: 'NETS', VAN: 'GRIZZLIES', NOH: 'HORNETS',
  NOK: 'HORNETS', WSB: 'BULLETS', CHH: 'HORNETS', SDC: 'CLIPPERS',
  KCK: 'KINGS', BUF: 'BRAVES',
  'W-LVA': 'ACES', 'W-NYL': 'LIBERTY', 'W-SEA': 'STORM',
  'W-MIN': 'LYNX', 'W-CHI': 'SKY', 'W-IND': 'FEVER',
  'W-PHX': 'MERCURY', 'W-LAX': 'SPARKS', 'W-CON': 'SUN',
  'W-ATL': 'DREAM', 'W-DAL': 'WINGS', 'W-WAS': 'MYSTICS',
  'W-GSV': 'VALKYRIES',
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pick(arr: string[], seed: string): string {
  return arr[hash(seed) % arr.length];
}

// {W} = winner's nickname

const CATASTROPHIC = [ // ≥70
  'THE {W} SHOULD SEND A FRUIT BASKET',
  'GROUNDS FOR TERMINATION',
  'SOMEBODY PANICKED',
  'SOMEONE OWES THEIR FANBASE AN APOLOGY',
  'THE {W} KNEW SOMETHING',
  'THE OTHER GM WAS ON VACATION',
  'GENERATIONAL BLUNDER',
  'THIS ONE STILL HURTS',
  "THAT'S NOT A TRADE, THAT'S A GIFT",
  "SOMEBODY'S GETTING FIRED",
  'THE {W} HIT THE JACKPOT',
  "LOPSIDED DOESN'T BEGIN TO COVER IT",
  'SOMEONE PRESSED THE WRONG BUTTON',
  'THAT GM SHOULD UPDATE THEIR RESUME',
  'NOT A SINGLE PERSON IN THAT FRONT OFFICE SAID NO?',
];

const STRONG = [ // ≥40
  'THE {W} SAW SOMETHING NOBODY ELSE DID',
  'THE {W} PLAYED IT PERFECTLY',
  'THE {W} CHANGED THEIR FRANCHISE',
  'THE {W} WILL BE TELLING THIS STORY FOR YEARS',
  'THE {W} CAUGHT LIGHTNING',
  'THE {W} CASHED IN',
  'THE {W} FOUND THEIR GUY',
  'THE {W} WON THE OFFSEASON',
];

const CLEAR = [ // ≥20
  'THE {W} GOT AWAY WITH ONE',
  "THE {W} AREN'T COMPLAINING",
  'THE {W} WILL TAKE THAT EVERY TIME',
  'THE {W} SOLD HIGH',
  'ONE GM DID THEIR HOMEWORK',
  'THE {W} READ THE ROOM',
  'THE {W} MADE THE RIGHT CALL',
  'THE {W} OWE THEIR GM DINNER',
  'THE {W} PULLED THE TRIGGER AT THE RIGHT TIME',
  'THE {W} HAD THE BETTER SCOUTING REPORT',
  'THE {W} PLAYED THE LONG GAME',
  'PATIENCE PAID OFF FOR THE {W}',
  'THE {W} SET THE PRICE',
  'THE {W} CALLED THEIR SHOT',
  'ONE TEAM HAD A PLAN',
  'THE {W} MADE THE UNPOPULAR MOVE',
  'THE {W} GOT THEIR GUY',
  'THE {W} WALKED AWAY CLEAN',
  'THE {W} MOVED FIRST AND IT MATTERED',
  'THE {W} TOOK A FLYER AND IT PAID OFF',
  'THE {W} PUT THEIR CHIPS ON THE TABLE',
  'REVISIONIST HISTORY FAVORS THE {W}',
  'THE {W} BET ON THEMSELVES AND WON',
];

const MODERATE = [ // ≥10
  'THE {W} GOT THE BETTER END',
  'THE {W} CAME OUT AHEAD',
  "THE {W} WON'T COMPLAIN",
  'THE {W} GOT FULL VALUE',
  'THE {W} UPGRADED',
  'SOMEBODY OVERPAID',
  'SOMEBODY PAID A PREMIUM',
  "BUYER'S REMORSE INCOMING",
  "THAT'S A LOT TO GIVE UP",
  'ADVANTAGE {W}',
];

const SLIGHT = [ // ≥3
  'SLIGHT EDGE TO THE {W}',
  'THE {W} EDGED IT',
];

const EVEN = [ // <3 or no winner
  'TOO CLOSE TO CALL',
  'A WASH',
  'BOTH TEAMS CAN LIVE WITH THIS',
  'NOBODY LOST SLEEP OVER THIS',
  'PUSH',
  'COIN FLIP',
  'FAIR TRADE',
  'CALL IT EVEN',
  'NO HARM, NO FOUL',
  'BOTH GMS CAN DEFEND THIS ONE',
  'A PERFECTLY BORING TRADE',
];

export function getVerdict(winner: string | null, lopsidedness: number): string {
  const seed = `${winner || 'none'}_${Math.round(lopsidedness)}`;

  if (!winner || lopsidedness < 3) {
    return pick(EVEN, seed);
  }

  const nick = NICK[winner] || winner.toUpperCase();

  let template: string;
  if (lopsidedness >= 85) {
    template = 'DOES NOT MEET THE CIPOLLONE STANDARD';
  } else if (lopsidedness >= 70) {
    template = pick(CATASTROPHIC, seed);
  } else if (lopsidedness >= 40) {
    template = pick(STRONG, seed);
  } else if (lopsidedness >= 20) {
    template = pick(CLEAR, seed);
  } else if (lopsidedness >= 10) {
    template = pick(MODERATE, seed);
  } else {
    template = pick(SLIGHT, seed);
  }

  return template.replace(/\{W\}/g, nick);
}
