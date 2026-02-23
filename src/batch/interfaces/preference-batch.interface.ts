import { User } from '@/user/entities/user.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';

export interface UserSelectionGroup {
  user: User;
  selections: MenuSelection[];
  slotMenus: {
    breakfast: string[];
    lunch: string[];
    dinner: string[];
    etc: string[];
  };
}

export interface PreferenceAnalysisResult {
  analysis: string;
  compactSummary: string;
  analysisParagraphs?: {
    paragraph1: string;
    paragraph2: string;
    paragraph3: string;
  };
  stablePatterns?: {
    categories: string[];
    flavors: string[];
    cookingMethods: string[];
    confidence: 'low' | 'medium' | 'high';
  };
  recentSignals?: {
    trending: string[];
    declining: string[];
  };
  diversityHints?: {
    explorationAreas: string[];
    rotationSuggestions: string[];
  };
}
