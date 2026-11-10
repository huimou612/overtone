import type { SongResult } from '../../types';
import type { OnlineProviderId } from '../../types/onlineMusic';

// Lab shim for folia's src/services/onlineMusic/songMetadata.ts.
// The app resolves provider-specific metadata through the online provider
// registry; the lab's songs are mock objects that already carry canonical
// artist/album fields, so the shim reads them directly.

export interface ProviderSongMetadata {
    artists: Array<{ name: string; id?: string | number }>;
    album: { id?: string | number; name: string; coverUrl?: string };
    durationMs: number;
    aliases: string[];
    translatedNames: string[];
    coverUrl?: string;
}

const EMPTY: ProviderSongMetadata = {
    artists: [],
    album: { name: '' },
    durationMs: 0,
    aliases: [],
    translatedNames: [],
};

export const getProviderSongMetadata = (
    song: SongResult | null | undefined,
    _providerId?: OnlineProviderId,
): ProviderSongMetadata => {
    if (!song) return EMPTY;
    return {
        artists: Array.isArray(song.artists) ? song.artists : [],
        album: song.album ?? { name: '' },
        durationMs: song.durationMs ?? 0,
        aliases: song.aliases ?? [],
        translatedNames: song.translatedNames ?? [],
        coverUrl: song.album?.coverUrl,
    };
};

export const getSongArtistLabel = (song: SongResult | null | undefined, providerId?: OnlineProviderId): string => (
    song ? getProviderSongMetadata(song, providerId).artists.map(artist => artist.name).filter(Boolean).join(', ') : ''
);

export const getSongAlbumLabel = (song: SongResult | null | undefined, providerId?: OnlineProviderId): string => (
    song ? getProviderSongMetadata(song, providerId).album?.name || '' : ''
);

export const getSongDurationMs = (song: SongResult | null | undefined, providerId?: OnlineProviderId): number => (
    song ? getProviderSongMetadata(song, providerId).durationMs : 0
);

export const getSongCoverUrl = (song: SongResult | null | undefined, providerId?: OnlineProviderId): string | undefined => (
    song ? getProviderSongMetadata(song, providerId).coverUrl : undefined
);

export const getProviderSongPageUrl = (_song: SongResult | null | undefined, _providerId?: OnlineProviderId): string | null => null;
