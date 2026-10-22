<template>
  <!-- 壁纸图层要挂在 #root 下、#container 之前：
       #root 自己在画 --background-image，而 #container 有 --color-app-background 会被它盖住，
       所以图层既不能在 #container 里面，也不能在它之后。 -->
  <layout-app-background />
  <div
    id="container"
    class="view-container"
    :class="{ 'mode-personal': isPersonalMode }"
  >
    <!-- 个性模式下侧栏收起，左侧留一条细热区用来把它唤出来 -->
    <div v-if="isPersonalMode" id="aside-hotzone" aria-hidden="true"></div>
    <layout-aside id="left" />
    <div id="right">
      <layout-toolbar id="toolbar" />
      <layout-view id="view" />
      <layout-play-bar id="player" />
    </div>
    <layout-icons />
    <layout-change-log-modal />
    <layout-update-modal />
    <layout-pact-modal />
    <layout-sync-mode-modal />
    <layout-sync-auth-code-modal />
    <layout-play-detail />
  </div>
  <!-- 统一歌词界面（沉浸式歌词 + Lattice 合并）：不只属于封面墙，全屏展示，
       所以挂在 #container 之外（#root 下），和 layout-app-background 同一层思路 -->
  <lattice-lyric :visible="isShowImmersiveLyric" @close="setShowImmersiveLyric(false)" />
</template>

<script setup>
import { onMounted } from '@common/utils/vueTools'
// import BubbleCursor from '@common/utils/effects/cursor-effects/bubbleCursor'
// import '@common/utils/effects/snow.min'
import { isPersonalMode } from '@renderer/store'
import { isShowImmersiveLyric } from '@renderer/store/player/state'
import { setShowImmersiveLyric } from '@renderer/store/player/action'
import LatticeLyric from './components/layout/LatticeLyric/index.vue'
import useApp from '@renderer/core/useApp'

useApp()

onMounted(() => {
  document.getElementById('root').style.display = 'block'

  // const styles = getComputedStyle(document.documentElement)
  // window.lxData.bubbleCursor = new BubbleCursor({
  //   fillStyle: styles.getPropertyValue('--color-primary-alpha-900'),
  //   strokeStyle: styles.getPropertyValue('--color-primary-alpha-700'),
  // })
})

// onBeforeUnmount(() => {
//   window.lxData.bubbleCursor?.destroy()
// })

</script>


<style lang="less">
@import './assets/styles/index.less';
@import './assets/styles/layout.less';

html {
  height: 100vh;
}
html, body {
  // overflow: hidden;
  box-sizing: border-box;
}

body {
  user-select: none;
  height: 100%;
}
#root {
  height: 100%;
  position: relative;
  overflow: hidden;
  color: var(--color-font);
  background: var(--background-image) var(--background-image-position) no-repeat;
  background-size: var(--background-image-size);
  transition: background-color @transition-normal;
  background-color: var(--color-content-background);
  box-sizing: border-box;
}

.disableAnimation * {
  transition: none !important;
  animation: none !important;
}

.transparent {
  background: transparent;
  padding: @shadow-app;
  // #waiting-mask {
  //   border-radius: @radius-border;
  //   left: @shadow-app;
  //   right: @shadow-app;
  //   top: @shadow-app;
  //   bottom: @shadow-app;
  // }
  #body {
    border-radius: @radius-border;
  }
  #root {
    box-shadow: 0 0 @shadow-app rgba(0, 0, 0, 0.5);
    border-radius: @radius-border;
  }
  // #container {
    // border-radius: @radius-border;
    // background-color: transparent;
  // }
}
.disableTransparent {
  background-color: var(--color-content-background);

  &.linux #body {
    border: 1px solid var(--color-primary-light-500);
  }
  &.windows:not(.windows-11, .fullscreen) #body {
    border-top: 1px solid #aaa;
  }

  #right {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  // #view { // 偏移5px距离解决非透明模式下右侧滚动条无法拖动的问题
  //   margin-right: 5Px;
  // }
}
.fullscreen {
  background-color: var(--color-content-background);

  #right {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
}

#container {
  position: relative;
  display: flex;
  height: 100%;
  background-color: var(--color-app-background);
}

#left {
  flex: none;
  width: @width-app-left;
}

/* ── 个性模式（沉浸形态） ──────────────────────────────────────
   同一套界面的另一种形态：侧栏收起成浮层，鼠标移到窗口左边缘再唤出。
   用绝对定位让 #left 脱离 flex 流，收起时 #right 自然铺满整个宽度。 */
#container.mode-personal {
  #aside-hotzone {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    // 17/18 要给侧栏本身：热区在底下时，侧栏展开后左边缘那 8px 才不会被热区吃掉点击。
    // 收起时 #left 整个在视口外，鼠标下最顶层的仍然是热区，所以唤出照样生效。
    z-index: 19;
  }

  #left {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 20;
    transform: translateX(-100%);
    transition: transform @transition-normal, box-shadow @transition-normal;
    // 浮层是覆盖式的，底色必须用内容区面板色（不透明）而不是最外层的 app 背景色：
    // 后者常常带 alpha，会让下面的播放条封面糊成一块脏斑 —— 浮层先要能看清，再谈透出壁纸。
    // backdrop-filter 留作兜底：万一某个主题把面板色也设成半透明，下层至少是糊的而不是清楚的。
    background-color: var(--color-main-background);
    backdrop-filter: blur(18px);
    box-shadow: none;
  }

  // 唤出：热区被 hover，或者鼠标已经移到侧栏自己身上了（收起时它在视口外，:hover 不会误触发）
  &:has(#aside-hotzone:hover) #left,
  #left:hover {
    transform: none;
    box-shadow: 2px 0 14px rgba(0, 0, 0, .22);
  }

  // 内容区铺满，去掉原来给侧栏让位用的左侧圆角与阴影
  #right {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    box-shadow: none;
  }
}

#right {
  flex: auto;
  display: flex;
  flex-flow: column nowrap;
  transition: background-color @transition-normal;
  background-color: var(--color-main-background);

  border-top-left-radius: @radius-border;
  border-bottom-left-radius: @radius-border;
  overflow: hidden;
  box-shadow: 0px 0px 4px rgba(0, 0, 0, 0.1);
}
#toolbar, #player {
  flex: none;
}
#view {
  position: relative;
  flex: auto;
  // display: flex;
  min-height: 0;
}

.view-container {
  transition: opacity @transition-normal;
}
#root.show-modal > .view-container {
  opacity: .9;
}
#view.show-modal > .view-container {
  opacity: .2;
}

</style>

