// Lab-trimmed version of folia's src/components/modal/settings/navigation/settingsAnchorModel.ts.
// Only what the kit's <SettingsAnchor> needs (the anchor-id -> section table); the settings
// subview table itself lives in the full app's useSettingsModalStore, which the lab does not run.
// Sections use the same string literals as folia's SettingsSubviewId.

type SettingsSubviewId =
    | 'appearance'
    | 'player'
    | 'home'
    | 'lyrics'
    | 'playback'
    | 'integration'
    | 'general'
    | 'interaction'
    | 'mods';

const SETTINGS_ANCHOR_DEFINITIONS = {
    lyricsRenderer: { section: 'appearance' },
    themePresets: { section: 'appearance' },
    electronSettings: { section: 'appearance' },
    playbackEntryView: { section: 'player' },
    latticeSettings: { section: 'player' },
    bottomUiSettings: { section: 'player' },
    stageTrackPill: { section: 'player' },
    videoLayerSettings: { section: 'player' },
    labPlayerUi: { section: 'player' },
    librarySuite: { section: 'home' },
    bravaisSettings: { section: 'home' },
    homeTabsVisibility: { section: 'home' },
    grid3dCardStyle: { section: 'home' },
    rememberHomeCardPosition: { section: 'home' },
    gridViewCardSettings: { section: 'home' },
    localLyricFormatOrder: { section: 'lyrics' },
    queueSettings: { section: 'playback' },
    transitionSettings: { section: 'playback' },
    replayGainSettings: { section: 'playback' },
    audioOutputSettings: { section: 'playback' },
    lyrics: { section: 'lyrics' },
    scrobbleSettings: { section: 'integration' },
    languageSettings: { section: 'general' },
    ponderHints: { section: 'general' },
    pinnedCommands: { section: 'interaction' },
    modList: { section: 'mods' },
} as const satisfies Record<string, { section: SettingsSubviewId }>;

export type SettingsAnchorId = keyof typeof SETTINGS_ANCHOR_DEFINITIONS;

export const SETTINGS_ANCHOR_SECTION = Object.fromEntries(
    Object.entries(SETTINGS_ANCHOR_DEFINITIONS).map(([id, definition]) => [id, definition.section]),
) as Record<SettingsAnchorId, SettingsSubviewId>;

export const settingsAnchorSubview = (anchorId: SettingsAnchorId): SettingsSubviewId => (
    SETTINGS_ANCHOR_SECTION[anchorId]
);
