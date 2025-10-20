export type SelectorType = 'role' | 'label' | 'testid' | 'css';
export type SelectorStability = 'high' | 'medium' | 'low';

export interface SelectorEntry {
  id: string;
  type: SelectorType;
  selector: string;
  priority: 1 | 2 | 3 | 4;
  lastSeen: string;
  stability: SelectorStability;
  page: string;
  accessible: boolean;
}

export interface SelectorRegistry {
  version: string;
  lastScanned: string;
  selectors: Record<string, SelectorEntry>;
}
