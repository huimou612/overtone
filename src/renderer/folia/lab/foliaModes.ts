import type { VisualizerMode } from '../types';

// The fifteen visualizer styles Folia ships, in the order its settings list
// shows them. `entry.tsx` registers each one; this is only the picker's copy,
// kept out of FoliaPlayer so the settings drawer can import it without a cycle.
export const FOLIA_VISUALIZER_MODES: ReadonlyArray<{ id: VisualizerMode; label: string; en: string }> = [
  { id: 'sonnet', label: '商籁', en: 'Sonnet' },
  { id: 'tempera', label: '凝彩', en: 'Tempera' },
  { id: 'classic', label: '流光', en: 'Classic' },
  { id: 'cadenza', label: '心象', en: 'Cadenza' },
  { id: 'partita', label: '云阶', en: 'Partita' },
  { id: 'fume', label: '浮名', en: 'Fume' },
  { id: 'tilt', label: '倾诉', en: 'Tilt' },
  { id: 'claddagh', label: '回环', en: 'Claddagh' },
  { id: 'monet', label: '莫奈', en: 'Monet' },
  { id: 'pendolo', label: '时计', en: 'Pendolo' },
  { id: 'cappella', label: '群唱', en: 'Cappella' },
  { id: 'diorama', label: '镜台', en: 'Diorama' },
  { id: 'still', label: '静止', en: 'Still' },
  { id: 'lumiere', label: '绘光', en: 'Lumiere' },
  { id: 'hanabi', label: '花火', en: 'Hanabi' },
];
