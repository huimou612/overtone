<template>
  <div id="my-list" :class="$style.container" @click="handleContainerClick">
    <MyList ref="myList" :list-id="listId" @show-menu="$refs.musicList.handleMenuClick()" />
    <MusicList ref="musicList" :list-id="listId" @show-menu="$refs.myList.handleMenuClick()" />
    <wall-view :visible="wallVisible" :list-id="listId" @close="wallVisible = false" />
  </div>
</template>

<script>
import { getListPrevSelectId } from '@renderer/utils/data'
import { wallOpenRequest } from '@renderer/store/songWall'

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
    // 消费侧栏「封面墙」入口的打开请求（含已在 /list 时再次点击的场景）
    this.unwatchWallRequest = this.$watch(
      () => wallOpenRequest.value,
      v => {
        if (!v) return
        wallOpenRequest.value = false
        this.wallVisible = true
      },
      { immediate: true },
    )
  },
  beforeUnmount() {
    this.unwatchWallRequest?.()
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

</style>
