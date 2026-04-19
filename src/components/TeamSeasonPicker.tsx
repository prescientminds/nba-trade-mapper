'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TEAM_LIST } from '@/lib/teams';

const FIRST_SEASON_START_YEAR = 1999;
const LAST_SEASON_START_YEAR = 2025;

function buildSeasons(): string[] {
  const seasons: string[] = [];
  for (let y = LAST_SEASON_START_YEAR; y >= FIRST_SEASON_START_YEAR; y--) {
    seasons.push(`${y}-${String(y + 1).slice(-2)}`);
  }
  return seasons;
}

function seasonToYearSegment(season: string): string {
  const parts = season.split('-');
  const startYear = parseInt(parts[0], 10);
  return String(startYear + 1);
}

interface Option {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  minWidth: number;
  compact: boolean;
}

function CustomDropdown({ label, value, options, onChange, minWidth, compact }: CustomDropdownProps) {
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-scroll selected option into view when opened
  useEffect(() => {
    if (!open || !listRef.current) return;
    const selectedEl = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const triggerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-display)',
    fontSize: compact ? 13 : 15,
    fontWeight: 500,
    letterSpacing: 0.6,
    padding: open
      ? (compact ? '6px 13px' : '9px 17px')
      : (compact ? '7px 14px' : '10px 18px'),
    cursor: 'pointer',
    borderRadius: 999,
    border: open ? '2px solid var(--accent-orange)' : '1px solid var(--border-medium)',
    outline: 'none',
    transition: 'border 0.15s, padding 0.15s',
    minWidth,
    width: '100%',
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth }}>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 4,
          display: 'block',
        }}
      >
        {label}
      </span>

      <button type="button" onClick={() => setOpen((o) => !o)} style={triggerStyle}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? '—'}
        </span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          <path fill="none" stroke="var(--accent-orange)" strokeWidth="1.6" d="M1 1l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: 280,
            overflowY: 'auto',
            background: 'rgba(18, 18, 26, 0.98)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
            zIndex: 50,
            padding: 4,
          }}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            const isHover = i === hoverIdx;
            return (
              <div
                key={o.value}
                data-selected={isSelected}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{
                  padding: compact ? '6px 12px' : '8px 14px',
                  borderRadius: 6,
                  fontFamily: 'var(--font-display)',
                  fontSize: compact ? 13 : 14,
                  fontWeight: isSelected ? 700 : 500,
                  letterSpacing: 0.5,
                  color: isSelected
                    ? 'var(--accent-orange)'
                    : isHover
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                  background: isHover
                    ? 'rgba(255,107,53,0.10)'
                    : isSelected
                      ? 'rgba(255,107,53,0.06)'
                      : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.1s, color 0.1s',
                }}
              >
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface Props {
  compact?: boolean;
}

export default function TeamSeasonPicker({ compact = false }: Props) {
  const router = useRouter();
  const seasons = useMemo(buildSeasons, []);
  const [teamId, setTeamId] = useState<string>(TEAM_LIST[0].id);
  const [season, setSeason] = useState<string>(seasons[0]);

  const go = () => {
    router.push(`/roster/${teamId}/${seasonToYearSegment(season)}`);
  };

  const teamOptions: Option[] = useMemo(
    () => TEAM_LIST.map((t) => ({ value: t.id, label: t.name })),
    [],
  );
  const seasonOptions: Option[] = useMemo(
    () => seasons.map((s) => ({ value: s, label: s })),
    [seasons],
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      <CustomDropdown
        label="Team"
        value={teamId}
        options={teamOptions}
        onChange={setTeamId}
        minWidth={compact ? 170 : 230}
        compact={compact}
      />

      <CustomDropdown
        label="Season"
        value={season}
        options={seasonOptions}
        onChange={setSeason}
        minWidth={compact ? 110 : 140}
        compact={compact}
      />

      <button
        onClick={go}
        style={{
          padding: compact ? '7px 22px' : '10px 28px',
          borderRadius: 999,
          border: '2px solid var(--accent-orange)',
          background: 'var(--accent-orange)',
          color: '#fff',
          fontFamily: 'var(--font-display)',
          fontSize: compact ? 13 : 15,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'var(--transition-fast)',
          alignSelf: 'flex-end',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--accent-orange)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--accent-orange)';
          e.currentTarget.style.color = '#fff';
        }}
      >
        Go
      </button>
    </div>
  );
}
