'use client';

import { useEffect, useRef } from 'react';

export type ProtectionRule =
  | { kind: 'top_protected'; threshold: number }
  | { kind: 'lottery_protected' }
  | { kind: 'unprotected' }
  | { kind: 'least_favorable' }
  | { kind: 'most_favorable' }
  | { kind: 'nth_least_favorable'; n: number }
  | { kind: 'nth_most_favorable'; n: number }
  | { kind: 'swap_right' }
  | { kind: 'protected_unspecified' };

export interface ProtectionCondition {
  year: number;
  rule: ProtectionRule;
}

export type PickStatus = 'pending' | 'did_not_convey' | 'conveyed';
export type ProtectionConfidence = 'high' | 'medium' | 'low' | 'unparsed';

export interface PickProtection {
  pick_key: string;
  asset_class: 'pick' | 'swap';
  conditions: ProtectionCondition[];
  status: PickStatus;
  confidence: ProtectionConfidence;
  raw_snippet: string;
  trade_id: string;
  trade_date: string;
  notes: string[];
}

let protectionsCache: Record<string, PickProtection> | null = null;
let protectionsPromise: Promise<Record<string, PickProtection>> | null = null;

export async function loadProtections(): Promise<Record<string, PickProtection>> {
  if (protectionsCache) return protectionsCache;
  if (protectionsPromise) return protectionsPromise;
  protectionsPromise = fetch('/data/pick-protections.json')
    .then((r) => r.json())
    .then((j) => {
      protectionsCache = j.picks as Record<string, PickProtection>;
      return protectionsCache!;
    });
  return protectionsPromise;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatRule(rule: ProtectionRule): string {
  switch (rule.kind) {
    case 'top_protected':
      return `Top-${rule.threshold} protected`;
    case 'lottery_protected':
      return 'Lottery protected (top-14)';
    case 'unprotected':
      return 'Unprotected';
    case 'least_favorable':
      return 'Least favorable of group';
    case 'most_favorable':
      return 'Most favorable of group';
    case 'nth_least_favorable':
      return `${ordinal(rule.n)} least favorable of group`;
    case 'nth_most_favorable':
      return `${ordinal(rule.n)} most favorable of group`;
    case 'swap_right':
      return 'Swap right (other side picks first)';
    case 'protected_unspecified':
      return 'Protected (terms unspecified)';
  }
}

interface Props {
  protection: PickProtection | null;
  fallbackSnippet?: string;
  onClose: () => void;
}

export default function PickProtectionPopover({ protection, fallbackSnippet, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // Defer one tick so the opening click doesn't immediately close us.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 20,
        marginTop: 4,
        padding: '10px 12px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--accent-purple)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 11,
        fontFamily: 'var(--font-body)',
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: 'var(--accent-purple)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 700,
          }}
        >
          Protection
        </div>
        {protection && protection.status !== 'pending' && (
          <div
            style={{
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 999,
              background:
                protection.status === 'did_not_convey'
                  ? 'rgba(216, 138, 136, 0.15)'
                  : 'rgba(110, 224, 216, 0.15)',
              color:
                protection.status === 'did_not_convey' ? '#d88a88' : '#6ee0d8',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
            }}
          >
            {protection.status === 'did_not_convey' ? 'Did not convey' : 'Conveyed'}
          </div>
        )}
      </div>

      {protection && protection.conditions.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {protection.conditions.map((c, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                padding: '2px 0',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--pick-yellow, #f9c74f)',
                  minWidth: 32,
                }}
              >
                {c.year}
              </span>
              <span style={{ color: 'var(--text-primary)' }}>
                {formatRule(c.rule)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {protection?.confidence === 'unparsed'
            ? 'Pre-2019 trade — protection not parsed yet.'
            : 'No structured protection rules — raw description below.'}
        </div>
      )}

      {((protection && protection.raw_snippet) || fallbackSnippet) && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--border-subtle)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            lineHeight: 1.4,
          }}
        >
          {protection?.raw_snippet || fallbackSnippet}
        </div>
      )}

      {protection && (
        <div
          style={{
            marginTop: 6,
            fontSize: 9,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Source trade · {protection.trade_date}
        </div>
      )}
    </div>
  );
}
