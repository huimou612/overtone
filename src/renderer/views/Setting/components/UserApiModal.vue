<template lang="pug">
material-modal(:show="modelValue" bg-close teleport="#view" @close="handleClose")
  main.scroll(:class="$style.main")
    h2 {{ $t('user_api__title') }}
    ul.scroll(v-if="apiList.length" :class="$style.content")
      li(v-for="(api, index) in apiList" :key="api.id" :class="[$style.listItem, {[$style.active]: appSetting['common.apiSource'] == api.id}]")
        div(:class="$style.listLeft")
          h3
            | {{ api.name }}
            span(v-if="api.version") {{ /^\d/.test(api.version) ? `v${api.version}` : api.version }}
            span(v-if="api.author") {{ api.author }}
          p {{ api.description }}
          div
            base-checkbox(:id="`user_api_${api.id}`" v-model="api.allowShowUpdateAlert" :class="$style.checkbox" :label="$t('user_api__allow_show_update_alert')" @change="handleChangeAllowUpdateAlert(api, $event)")
        base-btn(:class="$style.listBtn" outline :aria-label="$t('user_api__btn_remove')" @click.stop="handleRemove(index)")
          svg(v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 212.982 212.982" space="preserve")
            use(xlink:href="#icon-delete")
    div(v-else :class="$style.content")
      div(:class="$style.noitem") {{ $t('user_api__noitem') }}
    div(:class="$style.safety")
      h3(:class="$style.safetyTitle")
        span(:class="$style.safetyBadge") 说明
        | 网络公开来源
      ul(:class="$style.safetyList")
        li 内置的「泛音聚合音源」聚合的是互联网上公开的第三方接口，与本项目无隶属关系，也不代表本项目的立场。
        li 这些接口可能随时限流、变更或失效；播放失败不代表软件故障，可在「音乐来源」里换一个源。
        li 本项目不会上传你的账号、歌单或本地文件；播放时只把歌名与歌手交给音源，取回播放地址。
        li 自定义源脚本在本机执行。导入来路不明的脚本有风险，请只导入你信任的源。
        li 音乐平台不易，请尊重版权、支持正版。
    div(:class="$style.note")
      p(:class="[$style.ruleLink]")
        | {{ $t('user_api__readme') }}
        span.hover.underline(aria-label="https://github.com/huimou612/overtone#readme" @click="handleOpenUrl('https://github.com/huimou612/overtone#readme')") FAQ
      p {{ $t('user_api__note') }}
    div(:class="$style.footer")
      base-btn(:class="$style.footerBtn" @click="isShowOnlineImportModal = true") {{ $t('user_api__btn_import_online') }}
      base-btn(:class="$style.footerBtn" @click="handleImport") {{ $t('user_api__btn_import') }}
      //- base-btn(:class="$style.footerBtn" @click="handleExport") {{ $t('user_api__btn_export') }}
    UserApiOnlineImportModal(v-model:show="isShowOnlineImportModal" @import="importUserApi")
</template>

<script>
import { importUserApi, removeUserApi, showSelectDialog, setAllowShowUserApiUpdateAlert } from '@renderer/utils/ipc'
import { readFile } from '@common/utils/nodejs'
import { openUrl } from '@common/utils/electron'
import apiSourceInfo from '@renderer/utils/musicSdk/api-source-info'
import { userApi } from '@renderer/store'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { computed, ref } from '@common/utils/vueTools'
import { dialog } from '@renderer/plugins/Dialog'

import UserApiOnlineImportModal from './UserApiOnlineImportModal.vue'

export default {
  components: {
    UserApiOnlineImportModal,
  },
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup() {
    const isShowOnlineImportModal = ref(false)
    const apiList = computed(() => userApi.list)

    return {
      userApi,
      apiList,
      appSetting,
      isShowOnlineImportModal,
    }
  },
  methods: {
    async importUserApi(script) {
      return importUserApi(script).then(({ apiList }) => {
        userApi.list = apiList
      }).catch((err) => {
        void dialog(this.$t('user_api_import__failed', { message: err.message }))
      })
    },
    handleImport() {
      if (this.userApi.list.length > 20) {
        this.$dialog({
          message: this.$t('user_api__max_tip'),
          confirmButtonText: this.$t('ok'),
        })
        return
      }
      void showSelectDialog({
        title: this.$t('user_api__import_file'),
        properties: ['openFile'],
        filters: [
          { name: 'LX API File', extensions: ['js'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }).then(async result => {
        if (result.canceled) return
        return readFile(result.filePaths[0]).then(async data => {
          return this.importUserApi(data.toString())
        })
      })
    },
    handleExport() {

    },
    async handleRemove(index) {
      const api = this.apiList[index]
      if (!api) return
      if (appSetting['common.apiSource'] == api.id) {
        let backApi = apiSourceInfo.find(api => !api.disabled)
        if (!backApi) backApi = userApi.list[0]
        updateSetting({ 'common.apiSource': backApi?.id ?? '' })
      }
      userApi.list = await removeUserApi([api.id])
    },
    handleClose() {
      this.$emit('update:modelValue', false)
    },
    handleOpenUrl(url) {
      void openUrl(url)
    },
    handleChangeAllowUpdateAlert(api, enable) {
      void setAllowShowUserApiUpdateAlert(api.id, enable)
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  padding: 15px 8px;
  max-width: 550px;
  min-width: 300px;
  display: flex;
  flex-flow: column nowrap;
  min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  h2 {
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
  }
}

.name {
  color: var(--color-primary);
}

.checkbox {
  margin-top: 3px;
  font-size: 14px;
  opacity: .86;
}

.content {
  flex: auto;
  min-height: 80px;
  max-height: 100%;
  margin-top: 15px;
  padding: 0 7px;
}
.listItem {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  transition: background-color 0.2s ease;
  padding: 15px 10px;
  border-radius: @radius-border;
  &:hover {
    background-color: var(--color-primary-background-hover);
  }
  &.active {
    background-color: var(--color-primary-background-active);
  }
  h3 {
    font-size: 15px;
    color: var(--color-font);
    word-break: break-all;
    span {
      font-size: 12px;
      color: var(--color-font-label);
      margin-left: 6px;
    }
  }
  p {
    margin-top: 5px;
    font-size: 14px;
    color: var(--color-font-label);
    word-break: break-all;
  }
}
.noitem {
  height: 100px;
  font-size: 18px;
  color: var(--color-font-label);
  display: flex;
  justify-content: center;
  align-items: center;
}
.listLeft {
  flex: auto;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
}
.listBtn {
  flex: none;
  height: 30px;
  width: 30px;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  svg {
    width: 60%;
  }
}
.safety {
  margin-top: 15px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--color-primary-background);
  color: var(--color-font);
  font-size: 12px;
  line-height: 1.6;
}
.safetyTitle {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
}
.safetyBadge {
  flex: none;
  padding: 0 6px;
  line-height: 16px;
  border-radius: 4px;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 400;
}
.safetyList {
  margin-top: 8px;
  padding-left: 16px;
  list-style: disc;
  opacity: .85;

  li + li { margin-top: 4px; }
}

.note {
  padding: 0 7px;
  margin-top: 15px;
  font-size: 12px;
  line-height: 1.25;
  color: var(--color-font);
  p {
    + p {
      margin-top: 5px;
    }
  }
}
.footer {
  padding: 0 7px;
  margin-top: 15px;
  display: flex;
  flex-flow: row nowrap;
}
.footerBtn {
  flex: auto;
  height: 36px;
  line-height: 36px;
  padding: 0 10px !important;
  width: 150px;
  .mixin-ellipsis-1();
  + .footerBtn {
    margin-left: 15px;
  }
}
.ruleLink {
  .mixin-ellipsis-1();
}

</style>
