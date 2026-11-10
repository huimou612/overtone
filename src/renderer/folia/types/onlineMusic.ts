// Lab-trimmed copy of folia's src/types/onlineMusic.ts — only the shapes the
// extracted modules name.

export type MediaId = string | number;

export type OnlineProviderId = 'netease' | 'qq' | 'kugou' | 'bodian' | 'qishui' | 'spotify' | 'ytm';

export type PlaybackSourceRef =
  | { kind: 'online'; providerId: OnlineProviderId; mediaId: string; variant?: 'cloud' }
  | { kind: 'local'; mediaId: string }
  | { kind: 'navidrome'; mediaId: string }
  | { kind: 'stage'; mediaId: string };

export type OmniProviderId = OnlineProviderId | 'local' | 'navidrome';

export interface OmniCollection {
  id: string;
  name: string;
  providerId: OmniProviderId;
  coverUrl?: string;
  kind?: 'album' | 'playlist' | 'mix' | 'artist';
  [key: string]: unknown;
}

export interface OmniExploreItem {
  id: string;
  name: string;
  kind: 'album' | 'playlist' | 'mix' | 'artist' | 'song';
  [key: string]: unknown;
}

export interface OmniExploreSection {
  id: string;
  heading: string;
  items: OmniExploreItem[];
  [key: string]: unknown;
}
