<template>
  <div ref="dom_menu" :class="$style.menu">
    <ul :class="$style.list" role="toolbar">
      <li v-for="item in menus" :key="item.to" :class="$style.navItem" role="presentation">
        <router-link :class="[$style.link, {[$style.active]: $route.meta.name == item.name}]" role="tab" :aria-selected="$route.meta.name == item.name" :to="item.to" :aria-label="item.tips" :title="item.tips" @click="item.onActivate?.()">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" :viewBox="item.iconSize" :height="item.size" :width="item.size" space="preserve">
            <use :xlink:href="item.icon" />
          </svg>
        </router-link>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { appSetting } from '@renderer/store/setting'
import { useI18n } from '@root/lang'
import { ref, computed } from '@common/utils/vueTools'
import { useIconSize } from '@renderer/utils/compositions/useIconSize'
import { wallOpenRequest } from '@renderer/store/songWall'

export default {
  name: 'NavBar',
  setup() {
    const t = useI18n()
    const dom_menu = ref<HTMLElement>()
    const iconSize = useIconSize(dom_menu, 0.32)

    const menus = computed(() => {
      const size = iconSize.value
      return [
        {
          to: '/search',
          tips: t('search'),
          icon: '#icon-search-2',
          iconSize: '0 0 425.2 425.2',
          size,
          name: 'Search',
          enable: true,
        },
        {
          to: '/songList/list',
          tips: t('song_list'),
          icon: '#icon-album',
          iconSize: '0 0 425.2 425.2',
          size,
          name: 'SongList',
          enable: true,
        },
        {
          to: '/leaderboard',
          tips: t('leaderboard'),
          icon: '#icon-leaderboard',
          iconSize: '0 0 425.22 425.2',
          size,
          name: 'Leaderboard',
          enable: true,
        },
        {
          to: '/list',
          tips: t('my_list'),
          icon: '#icon-love',
          iconSize: '0 0 444.87 391.18',
          size,
          name: 'List',
          enable: true,
        },
        {
          to: '/download',
          tips: t('download'),
          icon: '#icon-download-2',
          iconSize: '0 0 425.2 425.2',
          size,
          enable: appSetting['download.enable'],
          name: 'Download',
        },
        {
          // 封面墙入口（用户指定：覆盖原工作台位）。跳到我的列表并消费打开请求标记，
          // 由 List 视图展开全屏封面墙。
          to: '/list',
          tips: t('wall__open'),
          icon: '#icon-wall',
          iconSize: '0 0 24 24',
          size,
          enable: true,
          name: 'SongWall',
          onActivate: () => { wallOpenRequest.value = true },
        },
        {
          to: '/setting',
          tips: t('setting'),
          icon: '#icon-setting',
          iconSize: '0 0 493.23 436.47',
          size,
          enable: true,
          name: 'Setting',
        },
      ].filter(m => m.enable)
    })
    return {
      appSetting,
      menus,
      dom_menu,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.menu {
  flex: auto;
  // &.controlBtnLeft {
  //   display: flex;
  //   flex-flow: column nowrap;
  //   justify-content: center;
  //   padding-bottom: @control-btn-height;
  // }
  // padding: 5px;
}
.list {
  -webkit-app-region: no-drag;
  // margin-bottom: 15px;
  &:last-child {
    margin-bottom: 0;
  }
}
.navItem {
  position: relative;
  &:before {
    content: '';
    display: block;
    width: 100%;
    padding-bottom: 84%;
  }
}
.link {
  position: absolute;
  left: 0%;
  top: 0%;
  width: 100%;
  height: 100%;
  box-sizing: border-box;

  transition: @transition-fast;
  transition-property: background-color, opacity;
  color: var(--color-nav-font);
  cursor: pointer;
  text-align: center;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;
  .mixin-ellipsis-1();
  &:before {
    .mixin-after();
    left: 0;
    top: 0;
    width: 3px;
    height: 100%;
    background-color: var(--color-primary-dark-200-alpha-700);
    border-radius: 4px;
    transform: translateX(-100%);
    transition: transform @transition-fast;
  }

  &.active {
    // border-left-color: @color-theme-active;
    background-color: var(--color-primary-light-300-alpha-700);

    &:before {
      transform: translateX(0);
    }

    &:hover {
      background-color: var(--color-primary-light-300-alpha-800);
    }
  }


  &:hover {
    color: var(--color-nav-font);

    &:not(.active) {
      opacity: .8;
      background-color: var(--color-primary-light-400-alpha-700);
    }
  }
  &:active:not(.active) {
    opacity: .6;
    background-color: var(--color-primary-light-300-alpha-600);
  }
}
.link svg {
  flex: none;
}

</style>
