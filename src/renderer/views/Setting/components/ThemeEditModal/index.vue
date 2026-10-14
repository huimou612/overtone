<template>
  <material-modal :show="modelValue" max-height="90%" teleport="#view" @close="handleCancel">
    <main :class="$style.main">
      <h2>{{ themeId ? $t('theme_edit_modal__title_edit') : $t('theme_edit_modal__title_add') }}</h2>
      <div class="scroll" :class="$style.content">
        <div :class="[$style.group, $style.base]">
          <div :class="$style.groupContent">
            <div :class="$style.item">
              <div ref="primary_color_ref" :class="$style.color" />
              <div :class="$style.label">{{ $t('theme_edit_modal__primary') }}</div>
            </div>
            <div :class="$style.item">
              <div ref="font_color_ref" :class="$style.color" />
              <div :class="$style.label">{{ $t('theme_edit_modal__font') }}</div>
            </div>
            <div :class="$style.item">
              <div ref="app_bg_color_ref" :class="$style.color" />
              <div :class="$style.label">{{ $t('theme_edit_modal__app_bg') }}</div>
            </div>
            <div :class="$style.item">
              <div ref="aside_font_color_ref" :class="$style.color" />
              <div :class="$style.label">{{ $t('theme_edit_modal__aside_color') }}</div>
            </div>
            <div :class="$style.item">
              <div ref="main_bg_color_ref" :class="$style.color" />
              <div :class="$style.label">{{ $t('theme_edit_modal__main_bg') }}</div>
            </div>
          </div>
        </div>
        <!-- 阶段 7.2 动态壁纸：独立成组。原来「壁纸」只是基本组里的一个缩略图，
             现在多了模糊与遮罩两个可调项，混在颜色块里已经放不下了。 -->
        <div :class="[$style.group, $style.wallpaper]">
          <div :class="$style.groupTitle">
            <span :class="$style.title">{{ $t('theme_edit_modal__bg_image') }}</span>
            <span :class="$style.hint">{{ $t('theme_edit_modal__wallpaper_hint') }}</span>
          </div>
          <div :class="$style.groupContent">
            <div :class="[$style.item, $style.bg]">
              <div :class="[$style.bgImg, {[$style.hasBg]: !!bgMedia}]" @click="selectBgImg">
                <video v-if="bgMediaKind === 'video'" :class="$style.img" :src="bgMedia" autoplay loop muted playsinline />
                <img v-else-if="bgMedia" loading="lazy" decoding="async" :class="$style.img" :src="bgMedia" alt="Wallpaper">
                <svg-icon v-else :class="$style.icon" name="plus" />
                <button :class="$style.removeBtn" type="button" @click.stop="removeBgImg">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 212.982 212.982" space="preserve">
                    <use xlink:href="#icon-delete" />
                  </svg>
                </button>
              </div>
              <div :class="$style.label">{{ $t('theme_edit_modal__bg_image') }}</div>
            </div>
            <div :class="[$style.item, $style.rangeItem]">
              <input
                v-model.number="bgBlur"
                :class="$style.range"
                type="range" min="0" max="40" step="1"
                @input="handleWallpaperChange"
              >
              <div :class="$style.label">
                {{ $t('theme_edit_modal__wallpaper_blur') }}
                <span :class="$style.value">{{ bgBlur }}</span>
              </div>
            </div>
            <div :class="[$style.item, $style.rangeItem]">
              <input
                v-model.number="bgMask"
                :class="$style.range"
                type="range" min="0" max="90" step="1"
                @input="handleWallpaperChange"
              >
              <div :class="$style.label">
                {{ $t('theme_edit_modal__wallpaper_mask') }}
                <span :class="$style.value">{{ bgMask }}</span>
              </div>
            </div>
            <!-- 阶段 7.5：壁纸能不能被看见，最终由内容层的 alpha 决定。
                 这个值本来只能靠「内容区域背景颜色」那个取色器拖 alpha 通道来调，
                 藏得太深（也没人知道要找它），所以在这里给一个明确的一步到位。 -->
            <div :class="[$style.item, $style.translucentItem]">
              <button
                :class="[$style.translucentBtn, { [$style.on]: isTranslucent }]"
                type="button"
                @click="handleToggleTranslucent"
              >
                {{ isTranslucent ? $t('theme_edit_modal__translucent_off') : $t('theme_edit_modal__translucent_on') }}
              </button>
              <div :class="$style.label">{{ $t('theme_edit_modal__translucent') }}</div>
            </div>
          </div>
        </div>
        <div :class="$style.groupContent">
          <div :class="$style.group">
            <div :class="$style.groupTitle">
              <span :class="$style.title">{{ $t('theme_edit_modal__badge') }}</span>
              <span class="badge badge-theme-primary">{{ $t('tag__lossless') }}</span>
              <span class="badge badge-theme-secondary">{{ $t('tag__high_quality') }}</span>
              <span class="badge badge-theme-tertiary">kw</span>
            </div>
            <div :class="$style.groupContent">
              <div :class="$style.item">
                <div ref="badge_primary_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__badge_primary') }}</div>
              </div>
              <div :class="$style.item">
                <div ref="badge_secondary_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__badge_secondary') }}</div>
              </div>
              <div :class="$style.item">
                <div ref="badge_tertiary_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__badge_tertiary') }}</div>
              </div>
            </div>
          </div>
          <div :class="$style.group">
            <div :class="$style.groupTitle">
              <span>{{ $t('theme_edit_modal__control_btn') }}</span>
              <div :class="$style.controlBtn">
                <button type="button" :class="$style.hide">
                  <svg :class="$style.controlBtnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="80%" viewBox="0 0 30.727 30.727" space="preserve">
                    <use xlink:href="#icon-window-hide" />
                  </svg>
                </button>
                <button type="button" :class="$style.min">
                  <svg :class="$style.controlBtnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="100%" viewBox="0 0 24 24" space="preserve">
                    <use xlink:href="#icon-window-minimize" />
                  </svg>
                </button>
                <button type="button" :class="$style.close">
                  <svg :class="$style.controlBtnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="100%" viewBox="0 0 24 24" space="preserve">
                    <use xlink:href="#icon-window-close" />
                  </svg>
                </button>
              </div>
            </div>
            <div :class="$style.groupContent">
              <div :class="$style.item">
                <div ref="close_btn_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__close_btn') }}</div>
              </div>
              <div :class="$style.item">
                <div ref="min_btn_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__min_btn') }}</div>
              </div>
              <div :class="$style.item">
                <div ref="hide_btn_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__hide_btn') }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div :class="$style.footer">
        <div :class="$style.subContent" style="flex-wrap: wrap;">
          <base-input v-model="themeName" :class="$style.input" :placeholder="$t('theme_selector_modal__theme_name')" />
          <div :class="$style.subContent" style="flex-wrap: wrap;">
            <base-checkbox id="theme_edit_modal__dark" v-model="isDark" :class="$style.checkbox" :label="$t('theme_edit_modal__dark')" @change="handleDark" />
            <div :class="$style.subContent" style="flex-wrap: wrap;">
              <base-checkbox id="theme_edit_modal__dark_font" v-model="isDarkFont" :class="$style.checkbox" :label="$t('theme_edit_modal__dark_font')" @change="handleDarkFont" />
              <base-checkbox id="theme_edit_modal__preview" v-model="preview" :class="$style.checkbox" :label="$t('theme_edit_modal__preview')" @change="handlePreview" />
            </div>
          </div>
        </div>
        <div :class="$style.subContent" style="flex: none;">
          <base-btn v-if="themeId" :class="$style.btn" @click="handleRemove">{{ $t('theme_edit_modal__remove') }}</base-btn>
          <base-btn v-if="themeId" :class="$style.btn" @click="handleSaveNew">{{ $t('theme_edit_modal__save_new') }}</base-btn>
          <!-- <base-btn :class="$style.btn" @click="handleCancel">{{ $t('btn_cancel') }}</base-btn> -->
          <base-btn :class="$style.btn" @click="handleSubmit">{{ $t('btn_save') }}</base-btn>
        </div>
      </div>
    </main>
  </material-modal>
</template>

<script>
import { joinPath, extname, copyFile, checkPath, createDir, removeFile, moveFile, basename } from '@common/utils/nodejs'
import { nextTick, ref, watch } from '@common/utils/vueTools'
import { applyTheme, buildThemeColors, getThemes, copyTheme } from '@renderer/store/utils'
import { isUrl, encodePath } from '@common/utils/common'
// import { appSetting, updateSetting } from '@renderer/store/setting'
// import { applyTheme, getThemes } from '@renderer/store/utils'
import { createThemeColors } from '@common/theme/utils'
import useMainColor from './useMainColor'
import useFontColor from './useFontColor'
import useAppBgColor from './useAppBgColor'
import useMainBgColor from './useMainBgColor'
import useAsideFontColor from './useAsideFontColor'
import useBadgePrimaryColor from './useBadgePrimaryColor'
import useBadgeSecondaryColor from './useBadgeSecondaryColor'
import useBadgeTertiaryColor from './useBadgeTertiaryColor'
import useCloseBtnColor from './useCloseBtnColor'
import useMinBtnColor from './useMinBtnColor'
import useHideBtnColor from './useHideBtnColor'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { removeTheme, saveTheme, showSelectDialog } from '@renderer/utils/ipc'
import { dialog } from '@renderer/plugins/Dialog'
import { themeInfo } from '@renderer/store'


export default {
  name: 'ThemeSelectorModal',
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    themeId: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue', 'submit'],
  setup(props, { emit }) {
    const themeName = ref('')
    const isDark = ref(false)
    const isDarkFont = ref(false)
    const preview = ref(false)
    // 当前壁纸。图片与视频互斥，只有一边有值（图片走 --background-image，视频走 --background-video）。
    const bgMedia = ref('')
    const bgMediaKind = ref('none')
    const bgBlur = ref(0)
    const bgMask = ref(0)
    // 内容层当前是不是透明的。既决定「一键通透」按钮显示哪个词，
    // 也解释了「壁纸为什么看不见」—— 就是它撑着。
    const isTranslucent = ref(false)
    let bgMediaRaw = ''
    let originBgName = ''
    let currentBgPath = ''

    let theme

    const getColor = (color, theme) => {
      return color.startsWith('var')
        ? theme.config.themeColors[color.replace(/var\((.+)\)/, '$1')]
        : color
    }

    // 视频壁纸能吃的容器格式。GIF 不在这里 —— 它继续走 --background-image，
    // 由 CSS 自己播，不用多开一个 <video>。
    const isVideoFile = (name) => /\.(mp4|m4v|webm|ogv|mov|mkv)$/i.test(name)

    const clampInt = (value, min, max) => {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed)) return min
      return parsed < min ? min : (parsed > max ? max : parsed)
    }

    /** 把 extInfo 里已有的壁纸状态同步到界面（图片 / 视频 / 无）。 */
    const syncBgFromExtInfo = () => {
      const extInfo = theme.config.extInfo
      // 老主题没有这几个键，补上默认值再读，省得每个使用点都判空
      if (extInfo['--background-video'] == null) extInfo['--background-video'] = ''
      if (extInfo['--background-blur'] == null) extInfo['--background-blur'] = '0'
      if (extInfo['--background-mask'] == null) extInfo['--background-mask'] = '0'
      bgBlur.value = clampInt(extInfo['--background-blur'], 0, 40)
      bgMask.value = clampInt(extInfo['--background-mask'], 0, 90)

      const video = extInfo['--background-video']
      const image = extInfo['--background-image']
      let name = ''
      let kind = 'none'
      if (video && video != 'none') {
        name = video
        kind = 'video'
      } else if (image && image != 'none') {
        name = image
        kind = 'image'
      }

      if (kind == 'none') {
        bgMediaKind.value = 'none'
        bgMedia.value = ''
        bgMediaRaw = ''
        originBgName = ''
        return
      }
      bgMediaKind.value = kind
      bgMediaRaw = isUrl(name) ? name : joinPath(themeInfo.dataPath, name)
      bgMedia.value = encodePath(bgMediaRaw)
      originBgName = name
    }

    /** 取当前生效的壁纸名（视频优先），用于和 originBgName 比对、决定要不要删旧文件。 */
    const currentBgName = () => theme.config.extInfo['--background-video'] || theme.config.extInfo['--background-image']

    /** 把壁纸名写回 extInfo，按扩展名自动落到图片键或视频键，并清掉另一边。 */
    const applyBgName = (name) => {
      const extInfo = theme.config.extInfo
      if (isVideoFile(name)) {
        extInfo['--background-video'] = name
        extInfo['--background-image'] = 'none'
      } else {
        extInfo['--background-image'] = name
        extInfo['--background-video'] = ''
      }
    }

    const handleWallpaperChange = () => {
      theme.config.extInfo['--background-blur'] = String(bgBlur.value)
      theme.config.extInfo['--background-mask'] = String(bgMask.value)
      createPreview()
    }

    const createPreview = () => {
      if (!preview.value) return
      window.setTheme(buildThemeColors(theme, themeInfo.dataPath))
    }

    const { primary_color_ref, initMainColor, destroyMainColor } = useMainColor()
    const { font_color_ref, initFontColor, destroyFontColor } = useFontColor()
    const { app_bg_color_ref, initAppBgColor, destroyAppBgColor, setAppBgColor } = useAppBgColor()
    const { aside_font_color_ref, initAsideFontColor, destroyAsideFontColor, setAsideFontColor } = useAsideFontColor()
    const { main_bg_color_ref, initMainBgColor, destroyMainBgColor, setMainBgColor } = useMainBgColor()
    const { badge_primary_color_ref, initBadgePrimaryColor, destroyBadgePrimaryColor, setBadgePrimaryColor } = useBadgePrimaryColor()
    const { badge_secondary_color_ref, initBadgeSecondaryColor, destroyBadgeSecondaryColor, setBadgeSecondaryColor } = useBadgeSecondaryColor()
    const { badge_tertiary_color_ref, initBadgeTertiaryColor, destroyBadgeTertiaryColor, setBadgeTertiaryColor } = useBadgeTertiaryColor()
    const { close_btn_color_ref, initCloseBtnColor, destroyCloseBtnColor, setCloseBtnColor } = useCloseBtnColor()
    const { min_btn_color_ref, initMinBtnColor, destroyMinBtnColor, setMinBtnColor } = useMinBtnColor()
    const { hide_btn_color_ref, initHideBtnColor, destroyHideBtnColor, setHideBtnColor } = useHideBtnColor()

    // 主题的背景色可能是 var() 引用（如 var(--color-primary-light-600-alpha-700)），
    // 所以要先经 getColor 解析成实际色值，再从里面抠 alpha。
    const readAlpha = (color) => {
      const parts = String(color).match(/[\d.]+/g) ?? []
      return parts.length >= 4 ? Number(parts[3]) : 1
    }

    const syncTranslucent = () => {
      const raw = theme?.config.extInfo['--color-main-background']
      isTranslucent.value = raw ? readAlpha(getColor(raw, theme)) < 0.99 : false
    }

    /**
     * 在不透明 ↔ 半透明之间一键切。
     *
     * 只动 alpha、保留 RGB —— 用户挑的颜色不该被这个动作改掉。
     * 深浅两档取值不同：深色下内容层本来就更沉，给浅色那档的 0.62 会糊得读不清。
     */
    const handleToggleTranslucent = () => {
      const current = getColor(theme.config.extInfo['--color-main-background'], theme)
      const [r, g, b] = (String(current).match(/[\d.]+/g) ?? []).slice(0, 3)
      const alpha = isTranslucent.value ? 1 : (theme.isDark ? 0.72 : 0.62)
      const next = `rgba(${r}, ${g}, ${b}, ${alpha})`
      theme.config.extInfo['--color-main-background'] = next
      // 基本组里那个取色器还显示着旧值，一并推过去，否则两个控件各说各话
      setMainBgColor(next)
      syncTranslucent()
      createPreview()
    }

    let appBgColorOrigin
    let appBgColor
    let asideFontColorOrigin
    let asideFontColor
    let mainBgColorOrigin
    let mainBgColor
    let badgePrimaryColorOrigin
    let badgePrimaryColor
    let badgeSecondaryColorOrigin
    let badgeSecondaryColor
    let badgeTertiaryColorOrigin
    let badgeTertiaryColor
    let closeBtnColorOrigin
    let closeBtnColor
    let minBtnColorOrigin
    let minBtnColor
    let hideBtnColorOrigin
    let hideBtnColor

    const applyPrimaryColor = (color, fontColor, isDark, isDarkFont) => {
      theme.config.themeColors = createThemeColors(color, fontColor, isDark, isDarkFont)
      if (theme.config.extInfo['--color-app-background'].startsWith('var')) setAppBgColor(getColor(appBgColorOrigin, theme))
      if (theme.config.extInfo['--color-nav-font'].startsWith('var')) setAsideFontColor(getColor(asideFontColorOrigin, theme))
      if (theme.config.extInfo['--color-main-background'].startsWith('var')) setMainBgColor(getColor(mainBgColorOrigin, theme))
      if (theme.config.extInfo['--color-badge-primary'].startsWith('var')) setBadgePrimaryColor(getColor(badgePrimaryColorOrigin, theme))
      if (theme.config.extInfo['--color-badge-secondary'].startsWith('var')) setBadgeSecondaryColor(getColor(badgeSecondaryColorOrigin, theme))
      if (theme.config.extInfo['--color-badge-tertiary'].startsWith('var')) setBadgeTertiaryColor(getColor(badgeTertiaryColorOrigin, theme))
      if (theme.config.extInfo['--color-btn-close'].startsWith('var')) setCloseBtnColor(getColor(closeBtnColorOrigin, theme))
      if (theme.config.extInfo['--color-btn-min'].startsWith('var')) setMinBtnColor(getColor(minBtnColorOrigin, theme))
      if (theme.config.extInfo['--color-btn-hide'].startsWith('var')) setHideBtnColor(getColor(hideBtnColorOrigin, theme))

      createPreview()
    }

    const initColors = (_theme) => {
      theme = _theme
      // console.log(theme)
      themeName.value = theme.name
      isDark.value = theme.isDark
      isDarkFont.value = theme.isDarkFont ?? false
      currentBgPath = ''
      syncBgFromExtInfo()
      syncTranslucent()
      appBgColorOrigin = theme.config.extInfo['--color-app-background']
      appBgColor = getColor(appBgColorOrigin, theme)
      asideFontColorOrigin = theme.config.extInfo['--color-nav-font']
      asideFontColor = getColor(asideFontColorOrigin, theme)
      mainBgColorOrigin = theme.config.extInfo['--color-main-background']
      mainBgColor = getColor(mainBgColorOrigin, theme)
      badgePrimaryColorOrigin = theme.config.extInfo['--color-badge-primary']
      badgePrimaryColor = getColor(badgePrimaryColorOrigin, theme)
      badgeSecondaryColorOrigin = theme.config.extInfo['--color-badge-secondary']
      badgeSecondaryColor = getColor(badgeSecondaryColorOrigin, theme)
      badgeTertiaryColorOrigin = theme.config.extInfo['--color-badge-tertiary']
      badgeTertiaryColor = getColor(badgeTertiaryColorOrigin, theme)
      closeBtnColorOrigin = theme.config.extInfo['--color-btn-close']
      closeBtnColor = getColor(closeBtnColorOrigin, theme)
      minBtnColorOrigin = theme.config.extInfo['--color-btn-min']
      minBtnColor = getColor(minBtnColorOrigin, theme)
      hideBtnColorOrigin = theme.config.extInfo['--color-btn-hide']
      hideBtnColor = getColor(hideBtnColorOrigin, theme)

      initMainColor(theme.config.themeColors['--color-primary'], (color) => {
        applyPrimaryColor(color, theme.config.themeColors['--color-1000'], theme.isDark, theme.isDarkFont)
      })
      initFontColor(theme.config.themeColors['--color-1000'] ?? (isDark ? 'rgb(229, 229, 229)' : 'rgb(33, 33, 33)'), (color) => {
        applyPrimaryColor(theme.config.themeColors['--color-primary'], color, theme.isDark, theme.isDarkFont)
      })
      initAppBgColor(appBgColor, (color) => {
        // console.log('appBgColor', color)
        theme.config.extInfo['--color-app-background'] = color == appBgColor ? appBgColorOrigin : color
        createPreview()
      }, () => { setAppBgColor(getColor(appBgColorOrigin, theme)) })
      initAsideFontColor(asideFontColor, (color) => {
        theme.config.extInfo['--color-nav-font'] = color == asideFontColor ? asideFontColorOrigin : color
        createPreview()
      }, () => { setAsideFontColor(getColor(asideFontColorOrigin, theme)) })
      initMainBgColor(mainBgColor, (color) => {
        theme.config.extInfo['--color-main-background'] = color == mainBgColor ? mainBgColorOrigin : color
        // 用户可能直接在取色器里把 alpha 拖下去，按钮上的字得跟着变
        syncTranslucent()
        createPreview()
      }, () => { setMainBgColor(getColor(mainBgColorOrigin, theme)) })
      initBadgePrimaryColor(badgePrimaryColor, (color) => {
        theme.config.extInfo['--color-badge-primary'] = color == badgePrimaryColor ? badgePrimaryColorOrigin : color
        createPreview()
      }, () => { setBadgePrimaryColor(getColor(badgePrimaryColorOrigin, theme)) })
      initBadgeSecondaryColor(badgeSecondaryColor, (color) => {
        theme.config.extInfo['--color-badge-secondary'] = color == badgeSecondaryColor ? badgeSecondaryColorOrigin : color
        createPreview()
      }, () => { setBadgeSecondaryColor(getColor(badgeSecondaryColorOrigin, theme)) })
      initBadgeTertiaryColor(badgeTertiaryColor, (color) => {
        theme.config.extInfo['--color-badge-tertiary'] = color == badgeTertiaryColor ? badgeTertiaryColorOrigin : color
        createPreview()
      }, () => { setBadgeTertiaryColor(getColor(badgeTertiaryColorOrigin, theme)) })
      initCloseBtnColor(closeBtnColor, (color) => {
        theme.config.extInfo['--color-btn-close'] = color == closeBtnColor ? closeBtnColorOrigin : color
        createPreview()
      }, () => { setCloseBtnColor(getColor(closeBtnColorOrigin, theme)) })
      initMinBtnColor(minBtnColor, (color) => {
        theme.config.extInfo['--color-btn-min'] = color == minBtnColor ? minBtnColorOrigin : color
        createPreview()
      }, () => { setMinBtnColor(getColor(minBtnColorOrigin, theme)) })
      initHideBtnColor(hideBtnColor, (color) => {
        theme.config.extInfo['--color-btn-hide'] = color == hideBtnColor ? hideBtnColorOrigin : color
        createPreview()
      }, () => { setHideBtnColor(getColor(hideBtnColorOrigin, theme)) })

      createPreview()
    }
    const destroyColors = () => {
      destroyMainColor()
      destroyFontColor()
      destroyAppBgColor()
      destroyAsideFontColor()
      destroyMainBgColor()
      destroyBadgePrimaryColor()
      destroyBadgeSecondaryColor()
      destroyBadgeTertiaryColor()
      destroyCloseBtnColor()
      destroyMinBtnColor()
      destroyHideBtnColor()
    }

    watch(() => props.modelValue, (visible) => {
      void nextTick(() => {
        getThemes(({ themes, userThemes }) => {
          if (visible) {
            if (props.themeId) {
              const theme = userThemes.find(t => t.id == props.themeId)
              if (theme) {
                initColors(copyTheme(theme))
                return
              }
            }
            const theme = copyTheme(themes[0])
            theme.id = 'user_theme_' + Date.now()
            theme.name = ''
            theme.isCustom = true
            initColors(theme)
          } else {
            destroyColors()
            // 移除临时保存的背景
            if (currentBgPath) removeFile(currentBgPath).catch(_ => _)
          }
        })
      })
    })

    const selectBgImg = async() => {
      const result = await showSelectDialog({
        title: window.i18n.t('theme_edit_modal__select_bg_file'),
        properties: ['openFile'],
        filters: [
          {
            name: 'Wallpaper File',
            extensions: [
              // 图片
              'jpg', 'jpeg', 'jfif', 'pjpeg',
              'pjp', 'png', 'apng', 'avif', 'gif', 'svg',
              'webp', 'bmp',
              // 视频（阶段 7.2 动态壁纸）
              'mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv',
            ],
          },
        ],
      })
      if (result.canceled) return
      const path = result.filePaths[0]
      const fileName = `${theme.id}_${Date.now()}${extname(path)}`
      const tempDir = joinPath(themeInfo.dataPath, 'temp')
      const bgPath = joinPath(tempDir, fileName)
      if (!await checkPath(tempDir)) await createDir(tempDir)
      await copyFile(path, bgPath)
      // 反复换壁纸时把上一份临时文件删掉，否则 temp/ 会一直涨
      if (currentBgPath && currentBgPath != bgPath) void removeFile(currentBgPath).catch(_ => _)
      currentBgPath = bgMediaRaw = bgPath
      bgMedia.value = encodePath(bgMediaRaw)
      bgMediaKind.value = isVideoFile(bgPath) ? 'video' : 'image'
      // 图片与视频互斥：写一边、清另一边。写的是 temp/ 里的相对名，
      // 保存时（handleSubmit / handleSaveNew）才搬到正式目录。
      applyBgName('temp/' + fileName)

      createPreview()
    }
    const removeBgImg = async() => {
      if (currentBgPath) {
        void removeFile(currentBgPath)
        currentBgPath = ''
      }
      bgMedia.value = ''
      bgMediaRaw = ''
      bgMediaKind.value = 'none'
      theme.config.extInfo['--background-image'] = 'none'
      theme.config.extInfo['--background-video'] = ''
      createPreview()
    }
    const handleDark = (val) => {
      theme.isDark = val
      applyPrimaryColor(theme.config.themeColors['--color-primary'], theme.config.themeColors['--color-1000'], theme.isDark, theme.isDarkFont)
    }
    const handleDarkFont = (val) => {
      theme.isDarkFont = val
      applyPrimaryColor(theme.config.themeColors['--color-primary'], theme.config.themeColors['--color-1000'], theme.isDark, theme.isDarkFont)
    }
    /**
     * 预览主题
     * @param {*} val 是否预览当前编辑的主题
     */
    const handlePreview = (val) => {
      if (val) {
        createPreview()
      } else {
        applyTheme(appSetting['theme.id'], appSetting['theme.lightId'], appSetting['theme.darkId'], themeInfo.dataPath)
      }
    }
    const handleCancel = () => {
      handlePreview(false)
      emit('update:modelValue', false)
    }
    // 保存
    const handleSubmit = async() => {
      if (!themeName.value) return
      theme.name = themeName.value.substring(0, 20)
      // 保存新壁纸（图片/视频同路，只是按扩展名写回不同的键）
      if (currentBgPath && !isUrl(currentBgPath)) {
        const name = basename(currentBgPath)
        await moveFile(currentBgPath, joinPath(themeInfo.dataPath, name))
        applyBgName(name)
      }
      // 移除旧壁纸：只有当「当前生效的那份」和打开时的那份不是同一个文件才删
      if (originBgName && currentBgName() != originBgName && !isUrl(originBgName)) {
        void removeFile(joinPath(themeInfo.dataPath, originBgName))
      }
      if (props.themeId) {
        const index = themeInfo.userThemes.findIndex(t => t.id == theme.id)
        if (index > -1) themeInfo.userThemes.splice(index, 1, theme)
      } else themeInfo.userThemes.push(theme)
      handlePreview(false)
      await saveTheme(theme)
      emit('submit')
      emit('update:modelValue', false)
    }
    // 删除
    const handleRemove = async() => {
      const confirm = await dialog.confirm({
        message: window.i18n.t('theme_edit_modal__remove_tip'),
        cancelButtonText: window.i18n.t('cancel_button_text'),
        confirmButtonText: window.i18n.t('confirm_button_text'),
      })
      if (!confirm) return
      let isRequireUpdateSetting = false
      const newSetting = {}
      if (appSetting['theme.id'] == props.themeId) {
        newSetting['theme.id'] = 'overtone'
        isRequireUpdateSetting = true
      }
      if (theme.isDark) {
        if (appSetting['theme.darkId'] == props.themeId) {
          newSetting['theme.darkId'] = 'overtone_dark'
          isRequireUpdateSetting = true
        }
      } else {
        if (appSetting['theme.lightId'] == props.themeId) {
          newSetting['theme.lightId'] = 'overtone'
          isRequireUpdateSetting = true
        }
      }
      if (isRequireUpdateSetting) updateSetting(newSetting)
      if (originBgName) void removeFile(joinPath(themeInfo.dataPath, originBgName))
      await removeTheme(props.themeId)
      const index = themeInfo.userThemes.findIndex(t => t.id == theme.id)
      console.log(index)
      if (index > -1) themeInfo.userThemes.splice(index, 1)
      handlePreview(false)
      emit('submit')
      emit('update:modelValue', false)
    }
    // 另存为
    const handleSaveNew = async() => {
      if (!themeName.value) return
      theme.name = themeName.value.substring(0, 20)
      theme.id = 'user_theme_' + Date.now()
      // 保存新壁纸
      if (!isUrl(currentBgPath)) {
        if (currentBgPath) {
          const name = basename(currentBgPath)
          await moveFile(currentBgPath, joinPath(themeInfo.dataPath, name))
          applyBgName(name)
        } else if (bgMediaRaw) {
          const fileName = `${theme.id}_${Date.now()}${extname(bgMediaRaw)}`
          await copyFile(bgMediaRaw, joinPath(themeInfo.dataPath, fileName))
          applyBgName(fileName)
        }
      }
      themeInfo.userThemes.push(theme)
      handlePreview(false)
      await saveTheme(theme)
      emit('submit')
      emit('update:modelValue', false)
    }

    return {
      themeName,
      bgMedia,
      bgMediaKind,
      bgBlur,
      bgMask,
      isDark,
      handleDark,
      isDarkFont,
      handleDarkFont,
      preview,
      handlePreview,
      handleCancel,
      handleSubmit,
      handleRemove,
      handleSaveNew,
      selectBgImg,
      removeBgImg,
      handleWallpaperChange,
      isTranslucent,
      handleToggleTranslucent,

      primary_color_ref,
      font_color_ref,
      app_bg_color_ref,
      main_bg_color_ref,
      aside_font_color_ref,
      badge_primary_color_ref,
      badge_secondary_color_ref,
      badge_tertiary_color_ref,
      close_btn_color_ref,
      min_btn_color_ref,
      hide_btn_color_ref,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.main {
  // padding: 15px;
  // max-width: 400px;
  min-width: 300px;
  min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  min-height: 0;
  h2 {
    flex: none;
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
    padding: 15px;
  }
  h3 {
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    padding-bottom: 15px;
    font-size: 15px;
  }
}
.content {
  flex: auto;
  // padding: 15px 0;
  font-size: 14px;
  gap: 5px;
  display: flex;
  flex-flow: column nowrap;
}
.group {

}
.groupTitle {
  padding: 20px 20px 0;
  display: flex;
  flex-flow: row wrap;

  .title {
    margin-right: 5px;
  }
}
.groupContent {
  display: flex;
  flex-flow: row wrap;
}
.item {
  padding: 15px 20px 0;
  width: 74px;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
}
.base {
  .color {
    width: 100%;
  }
}
.color {
  width: 80%;
  aspect-ratio: 1 / 1;
  background-color: var(--pcr-color);
  border-radius: @radius-border;
  cursor: pointer;
  transition: @transition-fast !important;
  transition-property: background-color, opacity !important;
  box-shadow: 0 0 3px var(--color-primary-light-100-alpha-300);
  &:hover {
    opacity: .7;
  }
}
.label {
  padding-top: 10px;
  text-align: center;
}

.bg {
  // width: 0;
  // flex: 1 1 auto;
  width: 150px;
  // min-width: 60px;
  // max-width: 200px;
}
.bgImg {
  width: 100%;
  height: 60px;
  border: 1Px dashed var(--color-primary-light-100-alpha-300);
  transition: .3s ease;
  transition-property: border, color;
  box-sizing: border-box;
  border: 1px dashed var(--color-primary-light-100-alpha-300);
  color: var(--color-primary-light-100-alpha-300);
  position: relative;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: @transition-fast !important;
  transition-property: background-color, opacity !important;
  overflow: hidden;
  &:hover {
    opacity: .7;
  }

  &.hasBg {
    border: none;

    .removeBtn {
      display: block;
    }
  }

  .img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .removeBtn {
    position: absolute;
    right: 0;
    top: 0;
    border: none;
    cursor: pointer;
    padding: 6px 8px;
    background-color: rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.9);
    outline: none;
    transition: background-color 0.2s ease;
    line-height: 0;
    display: none;

    svg {
      height: .7em;
    }

    &:hover {
      background-color: rgba(0, 0, 0, 0.7);
    }
    &:active {
      background-color: rgba(0, 0, 0, 0.8);
    }
  }
  .icon {
    // position: absolute;
    // font-size: 16px;
    width: auto;
    height: 66%;
  }
}

.wallpaper {
  .hint {
    font-size: 12px;
    opacity: .6;
    line-height: 1.4;
  }
}

// 滑块比色块宽：色块是方的没关系，滑块太窄就没法调了
.rangeItem {
  width: 150px;
}
// 「通透」不是一个可以连续调的量（要么看得见壁纸、要么看不见），
// 所以做成一步到位的按钮，独占一行，不去跟两个滑块抢对齐。
.translucentItem {
  width: 100%;
  padding-top: 12px;
}
.translucentBtn {
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  border: 1px dashed var(--color-primary-light-100-alpha-300);
  border-radius: 5px;
  background-color: transparent;
  color: var(--color-font);
  font-size: inherit;
  cursor: pointer;
  transition: @transition-fast !important;
  transition-property: border-color, color, opacity !important;
  &:hover {
    opacity: .7;
  }
  // 已通透：实线描边 + 主色，一眼能看出这个开关是开着的
  &.on {
    border-style: solid;
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}
.range {
  width: 100%;
  height: 24px;
  margin: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  &:focus {
    outline: none;
  }
  // 轨道
  &::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background-color: var(--color-primary-alpha-700);
  }
  // 滑块。margin-top 是 (轨道高 4 - 滑块高 14) / 2 —— Chromium 的滑块默认对齐在轨道顶部，
  // 不减这一下会明显偏上。
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border-radius: 50%;
    background-color: var(--color-theme);
    box-shadow: 0 0 3px rgba(0, 0, 0, .35);
  }
}
.value {
  margin-left: 4px;
  opacity: .6;
  font-variant-numeric: tabular-nums;
}

@control-btn-width: @height-toolbar * .26;
.controlBtn {
  display: flex;
  -webkit-app-region: no-drag;
  align-items: center;
  padding: 0 @control-btn-width;
  flex-direction: row-reverse;
  // height: @height-toolbar * .7;
  transition: opacity @transition-normal;
  opacity: .5;
  &:hover {
    opacity: .8;
    .controlBtnIcon {
      opacity: 1;
    }
  }

  button {
    display: flex;
    position: relative;
    background: none;
    border: none;
    outline: none;
    padding: 1px;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    width: @control-btn-width;
    height: @control-btn-width;
    border-radius: 50%;
    color: var(--color-font);
    + button {
      margin-right: (@control-btn-width / 2);
    }

    &.hide {
      background-color: var(--color-btn-hide);
    }
    &.min, &.fullscreenExit {
      background-color: var(--color-btn-min);
    }
    // &.max {
    //   background-color: var(--color-btn-max);
    // }
    &.close {
      background-color: var(--color-btn-close);
    }
  }
}

.controlBtnIcon {
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
}

.note {
  padding: 8px 15px;
  font-size: 13px;
  line-height: 1.25;
  color: var(--color-font);
  // p {
  //   + p {
  //     margin-top: 5px;
  //   }
  // }
}
.footer {
  padding: 15px;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  font-size: 14px;
  .subContent {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    gap: 10px;
  }

  .checkbox {
    flex: none;
  }
  .input {
    max-width: 150px;
    flex: 0 1 auto;
  }
}


.btn {
  // box-sizing: border-box;
  // margin-left: 15px;
  // margin-bottom: 15px;
  // height: 36px;
  // line-height: 36px;
  // padding: 0 10px !important;
  min-width: 70px;
  // .mixin-ellipsis-1();
}

</style>
