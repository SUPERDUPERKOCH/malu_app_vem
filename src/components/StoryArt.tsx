import type { Ref } from 'react';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { sansFont, serifFont } from '../theme/fonts';

export type StoryStyle = 'branco' | 'vinhotx' | 'vinho' | 'creme';
export type StoryPosition = 'topo' | 'centro' | 'base';
export interface StorySummary { names: string[]; count: number; minutes: number; volumeKg: number; calories: number }

export const STORY_STYLES: ReadonlyArray<readonly [StoryStyle, string]> = [['branco', 'Texto branco'], ['vinhotx', 'Texto vinho'], ['vinho', 'Cartão vinho'], ['creme', 'Cartão creme']];
export const STORY_POSITIONS: ReadonlyArray<readonly [StoryPosition, string]> = [['topo', 'Topo'], ['centro', 'Centro'], ['base', 'Embaixo']];

const STYLES: Record<StoryStyle, { card: string | null; fg: string; accent: string; shadow: string | null }> = {
  branco: { card: null, fg: '#ffffff', accent: '#f3dba4', shadow: 'rgba(20,8,12,0.55)' },
  vinhotx: { card: null, fg: '#6b1f33', accent: '#8f6a26', shadow: 'rgba(255,255,255,0.85)' },
  vinho: { card: 'rgba(107,31,51,0.93)', fg: '#fbeee6', accent: '#d8b062', shadow: null },
  creme: { card: 'rgba(247,239,230,0.94)', fg: '#6b1f33', accent: '#a87d32', shadow: null },
};

const WIDTH = 1080; const HEIGHT = 1920; const BLOCK = 920;
// Áreas livres do Instagram: barra do topo (250 px) e campo de resposta (380 px).
const TOP = 250; const BOTTOM = HEIGHT - 380; const GAP = 36;

interface Line { text: string; y: number; size: number; color: 'fg' | 'accent'; font: 'serif' | 'sans'; weight: string; italic?: boolean; spacing?: number; x?: number; anchor?: 'middle' | 'start' | 'end' }
interface Block { height: number; lines: Line[]; rects: Array<{ x: number; y: number; width: number; height: number }> }

/** Quebra o texto por largura estimada (a medição real não existe no SVG nativo). */
function wrap(text: string, size: number, maxWidth: number, factor: number): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidth / (size * factor)));
  const lines: string[] = []; let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) { lines.push(current); current = word; } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

function phraseBlock(text: string, signature: boolean): Block {
  const lines: Line[] = [];
  let y = 90;
  lines.push({ text: 'VEM · VIDA EM MOVIMENTO', y, size: 28, color: 'accent', font: 'sans', weight: '700', spacing: 8 });
  y += 230;
  lines.push({ text: '“', y, size: 180, color: 'accent', font: 'serif', weight: '600' });
  y -= 40;
  let size = 78; let wrapped = wrap(text, size, BLOCK - 140, 0.47);
  while (wrapped.length > 6 && size > 46) { size -= 4; wrapped = wrap(text, size, BLOCK - 140, 0.47); }
  for (const line of wrapped) { y += size * 1.28; lines.push({ text: line, y, size, color: 'fg', font: 'serif', weight: '500', italic: true }); }
  y += 60;
  const rects = [{ x: BLOCK / 2 - 50, y, width: 100, height: 4 }];
  if (!signature) return { height: y + 60, lines, rects };
  y += 72;
  lines.push({ text: '@vem.clube', y, size: 32, color: 'fg', font: 'sans', weight: '600', spacing: 3 });
  return { height: y + 70, lines, rects };
}

function summaryBlock(summary: StorySummary): Block {
  const lines: Line[] = []; const rects: Block['rects'] = [];
  let y = 90;
  lines.push({ text: 'TREINO CONCLUÍDO ✓', y, size: 28, color: 'accent', font: 'sans', weight: '700', spacing: 8 });
  y += 95;
  const name = summary.count > 1 ? `${summary.count} treinos hoje` : summary.names[0] ?? 'Treino de hoje';
  const nameSize = Math.max(34, Math.min(60, Math.floor((BLOCK - 120) / (Math.max(1, name.length) * 0.5))));
  lines.push({ text: name, y, size: nameSize, color: 'fg', font: 'serif', weight: '600' });
  y += 70;
  const columns: Array<[string, string]> = [[summary.minutes < 1 && summary.count ? '<1' : String(summary.minutes), 'MINUTOS']];
  if (summary.volumeKg > 0) columns.push([summary.volumeKg.toLocaleString('pt-BR'), 'KG DE VOLUME']);
  columns.push([`~${summary.calories.toLocaleString('pt-BR')}`, 'KCAL']);
  const columnWidth = (BLOCK - 80) / columns.length;
  columns.forEach(([value, label], index) => {
    const x = 40 + columnWidth * index + columnWidth / 2;
    const size = Math.max(48, Math.min(100, Math.floor((columnWidth - 30) / (value.length * 0.58))));
    lines.push({ text: value, y: y + 92, size, color: 'fg', font: 'sans', weight: '700', x });
    lines.push({ text: label, y: y + 142, size: 24, color: 'accent', font: 'sans', weight: '700', spacing: 4, x });
    if (index > 0) rects.push({ x: 40 + columnWidth * index - 1, y: y + 10, width: 2, height: 130 });
  });
  y += 142 + 82;
  lines.push({ text: '@vem.clube', y, size: 32, color: 'fg', font: 'sans', weight: '600', spacing: 3 });
  return { height: y + 60, lines, rects };
}

export function StoryArt({
  phrase,
  summary,
  style,
  position,
  width,
  svgRef,
}: {
  phrase?: string;
  summary?: StorySummary;
  style: StoryStyle;
  position: StoryPosition;
  width: number;
  svgRef?: Ref<Svg>;
}) {
  const palette = STYLES[style];
  const blocks: Block[] = [];
  if (phrase) blocks.push(phraseBlock(phrase, !summary));
  if (summary) blocks.push(summaryBlock(summary));
  const total = blocks.reduce((sum, block) => sum + block.height, 0) + GAP * Math.max(0, blocks.length - 1);
  const scale = Math.min(1, (BOTTOM - TOP) / Math.max(1, total));
  const scaledHeight = total * scale;
  const x0 = (WIDTH - BLOCK * scale) / 2;
  let y = position === 'topo' ? TOP : position === 'centro' ? (HEIGHT - scaledHeight) / 2 : BOTTOM - scaledHeight;
  const placed = blocks.map((block) => { const top = y; y += (block.height + GAP) * scale; return { block, top }; });
  const fontFamily = (font: Line['font']): string => (font === 'serif' ? serifFont : sansFont);

  return (
    <Svg ref={svgRef} width={width} height={(width * HEIGHT) / WIDTH} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      {placed.map(({ block, top }, blockIndex) => (
        <G key={blockIndex} transform={`translate(${x0} ${top}) scale(${scale})`}>
          {palette.card && (
            <>
              <Rect x={0} y={0} width={BLOCK} height={block.height} rx={48} fill={palette.card} />
              <Rect x={16} y={16} width={BLOCK - 32} height={block.height - 32} rx={36} fill="none" stroke={palette.accent} strokeOpacity={0.45} strokeWidth={2} />
            </>
          )}
          {block.rects.map((rect, index) => <Rect key={`r${index}`} {...rect} fill={palette.accent} opacity={index === 0 && block.rects.length === 1 ? 1 : 0.5} />)}
          {block.lines.flatMap((line, index) => {
            const common = {
              x: line.x ?? BLOCK / 2, y: line.y, fontSize: line.size, fontFamily: fontFamily(line.font), fontWeight: line.weight,
              fontStyle: line.italic ? 'italic' as const : 'normal' as const, textAnchor: line.anchor ?? 'middle' as const, letterSpacing: line.spacing ?? 0,
            };
            const nodes = [];
            if (palette.shadow) nodes.push(<SvgText key={`s${index}`} {...common} x={common.x + 2} y={common.y + 3} fill={palette.shadow}>{line.text}</SvgText>);
            nodes.push(<SvgText key={`t${index}`} {...common} fill={line.color === 'fg' ? palette.fg : palette.accent}>{line.text}</SvgText>);
            return nodes;
          })}
        </G>
      ))}
    </Svg>
  );
}

export const STORY_SIZE = { width: WIDTH, height: HEIGHT };
