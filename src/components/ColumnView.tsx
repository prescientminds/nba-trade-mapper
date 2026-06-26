'use client';

/**
 * Column View — a Finder-style, depth-ranked reading of a trade chain.
 *
 * Column N is a list of trades at BFS depth N from the root trade. Selecting a row in
 * column N populates column N+1 with that trade's downstream branches. Arrow keys move
 * the cursor; →/Tab drills into the selected branch, ←/Shift-Tab steps back out.
 *
 * Desktop-only by design (locked 2026-06-24). Data model lives in lib/column-view.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildColumnViewModel,
  columnNodes,
  type ColumnViewModel,
  type ColumnTradeNode,
} from '@/lib/column-view';
import { getAnyTeamDisplayInfo } from '@/lib/teams';
import type { League } from '@/lib/league';

interface ColumnViewProps {
  rootTradeId: string;
  league?: League;
  /** Fired when a row is activated (Enter / double-click) — e.g. to focus it on the canvas. */
  onSelectTrade?: (tradeId: string) => void;
  onClose?: () => void;
}

function tradeYear(date: string | undefined): string {
  if (!date) return '';
  return date.slice(0, 4);
}

function TeamPills({ node }: { node: ColumnTradeNode }) {
  const teams = node.trade?.teams ?? [];
  const date = node.trade?.date ?? null;
  if (teams.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {teams.map((t, i) => {
        const info = getAnyTeamDisplayInfo(t.team_id, date);
        return (
          <span
            key={`${t.team_id}-${i}`}
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.4,
              padding: '1px 5px',
              borderRadius: 4,
              color: '#fff',
              background: info.color,
            }}
          >
            {info.abbreviation}
          </span>
        );
      })}
    </div>
  );
}

function TradeRow({
  node,
  selected,
  focused,
  onClick,
  onActivate,
}: {
  node: ColumnTradeNode;
  selected: boolean;
  focused: boolean;
  onClick: () => void;
  onActivate: () => void;
}) {
  const hasChildren = node.childTradeIds.length > 0;
  const title = node.trade?.title ?? node.tradeId;
  const names = node.assetNames.slice(0, 3).join(', ');
  const moreCount = Math.max(0, node.assetNames.length - 3);

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onActivate}
      data-trade-id={node.tradeId}
      data-selected={selected ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        width: '100%',
        textAlign: 'left',
        padding: '8px 10px',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        background: selected ? 'rgba(255,107,53,0.16)' : 'transparent',
        outline: focused ? '2px solid rgba(255,107,53,0.7)' : '2px solid transparent',
        outlineOffset: -2,
        transition: 'background 0.12s',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--text-primary, #f2f2f2)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ color: 'var(--text-tertiary, #888)', fontWeight: 500 }}>
            {tradeYear(node.trade?.date)}{' '}
          </span>
          {title}
        </div>
        {names && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-secondary, #aaa)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 2,
            }}
          >
            {names}
            {moreCount > 0 && <span style={{ color: 'var(--text-tertiary, #888)' }}> +{moreCount}</span>}
          </div>
        )}
        <TeamPills node={node} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            fontWeight: 700,
            color: '#f9c74f',
          }}
        >
          {node.score.toFixed(1)}
        </span>
        {hasChildren && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary, #888)', lineHeight: 1 }}>›</span>
        )}
      </div>
    </button>
  );
}

export default function ColumnView({ rootTradeId, league = 'NBA', onSelectTrade, onClose }: ColumnViewProps) {
  const [model, setModel] = useState<ColumnViewModel | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  // selectedPath[i] = trade id chosen in column i. selectedPath[0] is always the root.
  const [selectedPath, setSelectedPath] = useState<string[]>([rootTradeId]);
  // Keyboard cursor.
  const [focus, setFocus] = useState<{ col: number; row: number }>({ col: 0, row: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  // Refs mirror the cursor + derived columns so the key handler always reads the latest
  // value, even when several keypresses land before React commits a render.
  const focusRef = useRef(focus);
  const pathRef = useRef(selectedPath);
  const columnsRef = useRef<ColumnTradeNode[][]>([]);
  const setFocusBoth = useCallback((f: { col: number; row: number }) => {
    focusRef.current = f;
    setFocus(f);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    pathRef.current = [rootTradeId];
    setSelectedPath([rootTradeId]);
    setFocusBoth({ col: 0, row: 0 });
    buildColumnViewModel(rootTradeId, league)
      .then((m) => {
        if (cancelled) return;
        if (!m) {
          setStatus('empty');
          setModel(null);
          return;
        }
        setModel(m);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [rootTradeId, league]);

  // Derive the rendered columns from the selection path. Column 0 = [root]; each deeper
  // column lists the children of the previously selected trade.
  const columns = useMemo<ColumnTradeNode[][]>(() => {
    if (!model) return [];
    const root = model.nodes[rootTradeId];
    if (!root) return [];
    const cols: ColumnTradeNode[][] = [[root]];
    for (let i = 0; i < selectedPath.length; i++) {
      const sel = model.nodes[selectedPath[i]];
      if (sel && sel.childTradeIds.length > 0) {
        cols.push(columnNodes(model, sel.childTradeIds));
      } else {
        break;
      }
    }
    return cols;
  }, [model, rootTradeId, selectedPath]);

  // Mirror derived columns + path into refs for the key handler.
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);
  useEffect(() => {
    pathRef.current = selectedPath;
  }, [selectedPath]);

  const selectRow = useCallback(
    (col: number, node: ColumnTradeNode, rowIndex: number) => {
      const next = pathRef.current.slice(0, col);
      next[col] = node.tradeId;
      pathRef.current = next;
      setSelectedPath(next);
      setFocusBoth({ col, row: rowIndex });
    },
    [setFocusBoth],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const cols = columnsRef.current;
      if (!model || cols.length === 0) return;
      const col = Math.min(focusRef.current.col, cols.length - 1);
      const colNodes = cols[col];
      if (!colNodes || colNodes.length === 0) return;
      const row = Math.min(focusRef.current.row, colNodes.length - 1);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextRow = Math.min(row + 1, colNodes.length - 1);
        selectRow(col, colNodes[nextRow], nextRow);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nextRow = Math.max(row - 1, 0);
        selectRow(col, colNodes[nextRow], nextRow);
      } else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
        const cur = colNodes[row];
        if (cur && cur.childTradeIds.length > 0) {
          e.preventDefault();
          // Ensure this row is selected so the child column exists, then move into it.
          selectRow(col, cur, row);
          setFocusBoth({ col: col + 1, row: 0 });
        }
      } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
        if (col > 0) {
          e.preventDefault();
          const prevLen = cols[col - 1]?.length ?? 1;
          setFocusBoth({ col: col - 1, row: Math.min(focusRef.current.row, prevLen - 1) });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelectTrade?.(colNodes[row].tradeId);
      } else if (e.key === 'Escape') {
        onClose?.();
      }
    },
    [model, selectRow, setFocusBoth, onSelectTrade, onClose],
  );

  // Keep the focused column scrolled into view horizontally.
  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-column-index="${focus.col}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [focus.col]);

  const rootNode = model?.nodes[rootTradeId];

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="column-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg, #0a0a0f)',
        outline: 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-primary, #f2f2f2)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {rootNode?.trade?.title ?? 'Trade chain'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary, #888)', marginTop: 1 }}>
            Each column is one trade deeper down the chain · sorted by downstream win shares
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close column view"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-secondary, #aaa)',
              fontSize: 18,
              cursor: 'pointer',
              padding: '2px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Body */}
      {status === 'loading' && (
        <div style={{ padding: 24, color: 'var(--text-tertiary, #888)', fontSize: 13 }}>
          Loading chain…
        </div>
      )}
      {status === 'empty' && (
        <div style={{ padding: 24, color: 'var(--text-tertiary, #888)', fontSize: 13 }}>
          This trade has no scored downstream chain yet.
        </div>
      )}
      {status === 'error' && (
        <div style={{ padding: 24, color: '#ff6b6b', fontSize: 13 }}>
          Couldn’t load the chain for this trade.
        </div>
      )}

      {status === 'ready' && (
        <div
          style={{
            display: 'flex',
            flex: 1,
            minHeight: 0,
            overflowX: 'auto',
            overflowY: 'hidden',
          }}
        >
          {columns.map((colNodes, colIndex) => (
            <div
              key={colIndex}
              data-column-index={colIndex}
              data-testid={`column-${colIndex}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                width: 264,
                minWidth: 264,
                height: '100%',
                overflowY: 'auto',
                padding: 8,
                borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary, #888)',
                  padding: '2px 6px 6px',
                }}
              >
                {colIndex === 0 ? 'Root' : `Degree ${colIndex}`}
                <span style={{ fontWeight: 500 }}> · {colNodes.length}</span>
              </div>
              {colNodes.map((node, rowIndex) => (
                <TradeRow
                  key={node.tradeId}
                  node={node}
                  selected={selectedPath[colIndex] === node.tradeId}
                  focused={focus.col === colIndex && focus.row === rowIndex}
                  onClick={() => selectRow(colIndex, node, rowIndex)}
                  onActivate={() => onSelectTrade?.(node.tradeId)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
