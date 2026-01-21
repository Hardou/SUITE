export enum ModelType {
  SEO_THINKING = 'gemini-3-pro-preview',
  SEO_SEARCH = 'gemini-3-flash-preview',
  IMAGE_GEN = 'gemini-3-pro-image-preview',
  IMAGE_EDIT = 'gemini-2.5-flash-image',
  VIDEO_GEN = 'veo-3.1-fast-generate-preview',
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
  groundingUrls?: Array<{ uri: string; title: string }>;
  timestamp: number;
}

export interface GeneratedMedia {
  type: 'image' | 'video';
  url: string;
  prompt: string;
}

export interface User {
  email: string;
  full_name?: string;
  id?: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Window augmentation for Veo API key selection
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}