<template>
  <dt id="ai">{{ $t('setting__ai') }}</dt>
  <dd class="gap-top">
    <div>
      <div class="p">{{ $t('setting__ai_desc') }}</div>

      <!-- 服务提供方 -->
      <div class="p gap-top">
        <div class="p small">{{ $t('setting__ai_provider') }}</div>
        <div :class="$style.btnGroup">
          <base-btn
            v-for="item in providerList"
            :key="item.key"
            min
            :class="[$style.providerBtn, status.provider === item.key ? $style.active : '']"
            @click="changeProvider(item.key)"
          >
            {{ item.name }}
          </base-btn>
        </div>
        <div class="p small">{{ $t('setting__ai_provider_tip') }}</div>
      </div>

      <!-- API 密钥：只进不出 -->
      <div class="p gap-top">
        <div class="p small">
          {{ $t('setting__ai_key') }}
          <span :class="[$style.badge, keyConfigured ? $style.badgeOk : $style.badgeOff]">
            {{ keyConfigured ? $t('setting__ai_key_configured') : $t('setting__ai_key_not_configured') }}
          </span>
        </div>
        <div :class="$style.row">
          <base-input
            :class="$style.grow"
            type="password"
            :model-value="credentialInput"
            :placeholder="$t('setting__ai_key_placeholder')"
            @update:model-value="credentialInput = $event"
            @submit="saveCredential"
          />
          <base-btn min :disabled="!credentialInput || busy" @click="saveCredential">
            {{ $t('btn_save') }}
          </base-btn>
          <base-btn v-if="keyConfigured" min @click="clearCredential">
            {{ $t('setting__ai_key_clear') }}
          </base-btn>
        </div>
        <div class="p small">{{ status.encrypted ? $t('setting__ai_key_encrypted') : $t('setting__ai_key_not_encrypted') }}</div>
      </div>

      <!-- OpenAI 兼容才需要填地址和模型；Gemini 走内置端点 -->
      <template v-if="showOpenAiFields">
        <div class="p gap-top">
          <div class="p small">{{ $t('setting__ai_url') }}</div>
          <base-input
            :class="$style.grow"
            :model-value="form.OPENAI_API_URL"
            :placeholder="$t('setting__ai_url_placeholder')"
            @update:model-value="updateField('OPENAI_API_URL', $event)"
          />
          <div class="p small">{{ $t('setting__ai_url_tip') }}</div>
        </div>

        <div class="p gap-top">
          <div class="p small">{{ $t('setting__ai_model') }}</div>
          <base-input
            :class="$style.grow"
            :model-value="form.OPENAI_API_MODEL"
            :placeholder="$t('setting__ai_model_placeholder')"
            @update:model-value="updateField('OPENAI_API_MODEL', $event)"
          />
        </div>

        <div class="p gap-top">
          <div class="p small">{{ $t('setting__ai_temperature') }}</div>
          <base-input
            :class="$style.grow"
            type="number"
            :model-value="form.OPENAI_API_TEMPERATURE"
            @update:model-value="updateField('OPENAI_API_TEMPERATURE', $event)"
          />
          <!-- 这句当 placeholder 会被输入框宽度截断，放下面当提示才读得全 -->
          <div class="p small">{{ $t('setting__ai_temperature_tip') }}</div>
        </div>

        <div class="p gap-top">
          <base-checkbox
            id="setting_ai_stream"
            :model-value="form.OPENAI_API_STREAM"
            :label="$t('setting__ai_stream')"
            @update:model-value="updateField('OPENAI_API_STREAM', $event)"
          />
        </div>
      </template>

      <!-- 测试连接：用的是当前表单里的值，不是已保存的 -->
      <div class="p gap-top">
        <base-btn min :disabled="busy" @click="handleTest">
          {{ busy ? $t('setting__ai_testing') : $t('setting__ai_test') }}
        </base-btn>
      </div>
      <div v-if="testMessage" class="p small" :class="testOk ? $style.testOk : $style.testFail">
        {{ testMessage }}
      </div>
    </div>
  </dd>
</template>

<script>
import { computed, onMounted, reactive, ref } from '@common/utils/vueTools'
import { debounce } from '@common/utils'
import { useI18n } from '@renderer/plugins/i18n'
import { dialog } from '@renderer/plugins/Dialog'
import { getAiStatus, setAiSetting, setAiCredential, testAiConnection } from '@renderer/utils/ipc'

const describeError = error => (error instanceof Error ? error.message : String(error))

export default {
  name: 'SettingAi',
  setup() {
    const t = useI18n()

    // 服务端状态的只读镜像。凭据只拿得到布尔量，没有明文。
    const status = reactive({
      provider: 'openai',
      encrypted: true,
      credentials: { OPENAI_API_KEY: false, GEMINI_API_KEY: false },
      settings: {
        AI_PROVIDER: 'openai',
        OPENAI_API_URL: '',
        OPENAI_API_MODEL: '',
        OPENAI_API_TEMPERATURE: '',
        OPENAI_API_STREAM: false,
      },
      limits: { batchSize: 100, maxLines: 400 },
    })

    // 输入框的本地副本：打字不直接打到 IPC 上，防抖后才落盘
    const form = reactive({
      OPENAI_API_URL: '',
      OPENAI_API_MODEL: '',
      OPENAI_API_TEMPERATURE: '',
      OPENAI_API_STREAM: false,
    })

    // 明文密钥只在内存里停到「保存」为止，保存后立刻清空
    const credentialInput = ref('')
    const busy = ref(false)
    const testMessage = ref('')
    const testOk = ref(false)

    const credentialKey = computed(() => (status.provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'))
    const keyConfigured = computed(() => Boolean(status.credentials[credentialKey.value]))
    const showOpenAiFields = computed(() => status.provider === 'openai')

    const providerList = computed(() => [
      { key: 'openai', name: t('setting__ai_provider_openai') },
      { key: 'gemini', name: t('setting__ai_provider_gemini') },
    ])

    const applyStatus = result => {
      status.provider = result.provider
      status.encrypted = result.encrypted === true
      status.credentials = { ...result.credentials }
      status.settings = { ...result.settings }
      status.limits = { ...result.limits }
      form.OPENAI_API_URL = result.settings.OPENAI_API_URL ?? ''
      form.OPENAI_API_MODEL = result.settings.OPENAI_API_MODEL ?? ''
      form.OPENAI_API_TEMPERATURE = result.settings.OPENAI_API_TEMPERATURE ?? ''
      form.OPENAI_API_STREAM = result.settings.OPENAI_API_STREAM === true
    }

    const reportError = error => {
      testOk.value = false
      testMessage.value = t('setting__ai_test_fail', { error: describeError(error) })
    }

    const refresh = async() => {
      try {
        applyStatus(await getAiStatus())
      } catch (error) {
        reportError(error)
      }
    }

    const persist = debounce(async(key, value) => {
      try {
        const settings = await setAiSetting(key, value)
        status.settings = { ...settings }
      } catch (error) {
        reportError(error)
      }
    }, 600)

    const updateField = (key, value) => {
      form[key] = value
      persist(key, value)
    }

    const changeProvider = async key => {
      if (status.provider === key) return
      try {
        const settings = await setAiSetting('AI_PROVIDER', key)
        status.provider = key
        status.settings = { ...settings }
        // 换了提供方，之前输了一半的密钥已经不是这个方的了，清掉避免误存
        credentialInput.value = ''
        testMessage.value = ''
      } catch (error) {
        reportError(error)
      }
    }

    const saveCredential = async() => {
      const value = credentialInput.value.trim()
      if (!value || busy.value) return
      busy.value = true
      try {
        status.credentials = { ...(await setAiCredential(credentialKey.value, value)) }
        // 明文不回显，也不留在输入框里
        credentialInput.value = ''
        testMessage.value = ''
        testOk.value = true
        testMessage.value = t('setting__ai_saved')
      } catch (error) {
        reportError(error)
      } finally {
        busy.value = false
      }
    }

    const clearCredential = async() => {
      if (!await dialog.confirm(t('setting__ai_key_clear_confirm'))) return
      busy.value = true
      try {
        status.credentials = { ...(await setAiCredential(credentialKey.value, '')) }
        credentialInput.value = ''
        testMessage.value = ''
      } catch (error) {
        reportError(error)
      } finally {
        busy.value = false
      }
    }

    const handleTest = async() => {
      if (busy.value) return
      busy.value = true
      testMessage.value = ''
      try {
        const result = await testAiConnection({
          provider: status.provider,
          apiKey: credentialInput.value.trim() || undefined,
          apiUrl: showOpenAiFields.value ? form.OPENAI_API_URL : undefined,
          model: showOpenAiFields.value ? form.OPENAI_API_MODEL : undefined,
        })
        testOk.value = Boolean(result.ok)
        if (result.ok) {
          testMessage.value = result.emptyReason
            ? t('setting__ai_test_empty', { reason: result.emptyReason })
            : t('setting__ai_test_ok', { model: result.model ?? '-', duration: result.durationMs ?? 0 })
        } else {
          testMessage.value = t('setting__ai_test_fail', { error: result.error ?? '' })
        }
      } catch (error) {
        reportError(error)
      } finally {
        busy.value = false
      }
    }

    onMounted(() => {
      void refresh()
    })

    return {
      status,
      form,
      credentialInput,
      busy,
      testMessage,
      testOk,
      credentialKey,
      keyConfigured,
      showOpenAiFields,
      providerList,
      updateField,
      changeProvider,
      saveCredential,
      clearCredential,
      handleTest,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.btnGroup {
  display: flex;
  flex-flow: row nowrap;
  gap: 10px;
}
.providerBtn {
  min-width: 120px;
}
// 选中态用主题自带的这一对变量：浅色底 + 深色主色字。
// 注意不要用 background-color: var(--color-primary) 配 --color-button-font-selected ——
// 后者在浅色主题下本身就是主色系（primary-dark-100-alpha-100），绿底绿字会看不见。
.providerBtn.active {
  background-color: var(--color-button-background-selected);
  color: var(--color-button-font-selected);
  cursor: default;
}

.row {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
}
.grow {
  flex: 1 1 auto;
  min-width: 0;
}

.badge {
  margin-left: .5em;
  padding: 1px 6px;
  font-size: 12px;
  border-radius: 3px;
  white-space: nowrap;
}
.badgeOk {
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}
.badgeOff {
  color: var(--color-550);
  border: 1px solid var(--color-550);
}

.testOk {
  color: var(--color-primary);
}
.testFail {
  color: var(--color-550);
}
</style>
