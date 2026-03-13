/**
 * types.ts — Core type definitions for the Presentation System.
 *
 * Design principles:
 * - All types are game-agnostic; no game-specific fields
 * - Schema-driven: these types map 1:1 to Zod schemas in schema-integration.ts
 * - Server-side only: React components are NOT declared here
 */

// ---------------------------------------------------------------------------
// Screen template types
// ---------------------------------------------------------------------------

export type ScreenTemplateType =
  | 'lobby'
  | 'prompt'
  | 'vote'
  | 'reveal'
  | 'scoreboard'
  | 'results'
  | 'timer'
  | 'info'
  | 'media'
  | 'custom';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface ScreenLayout {
  type: 'centered' | 'split' | 'grid' | 'list' | 'stack' | 'fullscreen';
  columns?: number;
  gap?: string;
  padding?: string;
}

// ---------------------------------------------------------------------------
// Screen components
// ---------------------------------------------------------------------------

export interface ScreenComponent {
  type:
    | 'text'
    | 'timer'
    | 'player-list'
    | 'input'
    | 'image'
    | 'video'
    | 'audio'
    | 'score-table'
    | 'progress-bar'
    | 'button-group'
    | 'card'
    | 'grid';
  id?: string;
  props?: Record<string, unknown>;
  binding?: string;
  visibility?: 'all' | 'active-player' | 'spectators';
  style?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

export interface AnimationConfig {
  enter?: 'fade' | 'slide-up' | 'slide-left' | 'zoom' | 'none';
  exit?: 'fade' | 'slide-down' | 'slide-right' | 'zoom' | 'none';
  duration?: number;
}

// ---------------------------------------------------------------------------
// Screen declaration
// ---------------------------------------------------------------------------

export interface ScreenDeclaration {
  id: string;
  template: ScreenTemplateType;
  surface: 'display' | 'phone' | 'both';
  title?: string;
  subtitle?: string;
  layout?: ScreenLayout;
  components?: ScreenComponent[];
  animations?: AnimationConfig;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export interface GameTheme {
  name?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary?: string;
    error?: string;
    success?: string;
  };
  typography?: {
    fontFamily?: string;
    headingFont?: string;
    fontSize?: 'small' | 'medium' | 'large';
  };
  borderRadius?: string;
  spacing?: 'compact' | 'normal' | 'relaxed';
  darkMode?: boolean;
}

// ---------------------------------------------------------------------------
// Presentation config
// ---------------------------------------------------------------------------

export interface PresentationConfig {
  theme?: GameTheme;
  screens: ScreenDeclaration[];
  defaultAnimations?: AnimationConfig;
}

// ---------------------------------------------------------------------------
// Resolved screen
// ---------------------------------------------------------------------------

export interface ResolvedScreen {
  declaration: ScreenDeclaration;
  theme: GameTheme;
  bindings: Record<string, unknown>;
}
