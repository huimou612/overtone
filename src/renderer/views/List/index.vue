<template>
  <div id="my-list" :class="$style.container" @click="handleContainerClick">
    <MyList ref="myList" :list-id="listId" @show-menu="$refs.musicList.handleMenuClick()" />
    <MusicList ref="musicList" :list-id="listId" @show-menu="$refs.myList.handleMenuClick()" />
    <button v-show="!wallVisible" :class="$style.wallEntry" :aria-label="$t('wall__open')" :title="$t('wall__open')" @click.stop="wallVisible = true">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-wall" />
      </svg>
    </button>
    <wall-view :visible="wallVisible" :list-id="listId" @close="wallVisible = false" />
  </div>
</template>

<script>
import { getListPrevSelectId } from '@renderer/utils/data'

import MyList from './MyList/index.vue'
import MusicList from './MusicList/index.vue'
import WallView from './WallView.vue'

export default {
  name: 'List',
  components: {
    MyList,
    MusicList,
    WallView,
  },
  async beforeRouteEnter(to, from, next) {
    let id = to.query.id
    if (!id) {
      id = await getListPrevSelectId()
      next({
        path: to.path,
        query: { id },
      })
    } else next()
  },
  beforeRouteUpdate(to, from) {
    // console.log(to, from)
    if (to.query.updated) return
    let id = to.query.id
    if (id == null) return
    // if (!getList(id)) {
    //   id = defaultList.id
    // }
    this.listId = id
    const scrollIndex = to.query.scrollIndex
    const isAnimation = from.query.id == to.query.id
    this.$refs.musicList?.handleRestoreScroll(scrollIndex, isAnimation)

    return {
      path: '/list',
      query: { id, updated: true },
    }
  },
  beforeRouteLeave(to, from) {
    this.$refs.musicList?.saveListPosition()
  },
  data() {
    return {
      listId: null,
      wallVisible: false,
    }
  },
  created() {
    this.listId = this.$route.query.id
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  overflow: hidden;
  height: 100%;
  display: flex;
  position: relative;
}

.wallEntry {
  position: absolute;
  top: 14px;
  right: 18px;
  z-index: 5;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 12px;
  background-color: var(--color-primary-alpha-100);
  color: var(--color-primary);
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;

  &:hover {
    background-color: var(--color-primary-alpha-200);
    transform: translateY(-1px);
  }
}

</style>
