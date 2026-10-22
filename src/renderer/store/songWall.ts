import { ref } from '@common/utils/vueTools'

/**
 * 封面墙打开请求（侧栏入口 → List 视图的跨组件信号）
 *
 * 侧栏的「封面墙」入口与 List 视图没有父子关系（Aside 是布局层，墙是 List 的局部状态），
 * 路由 query 方案会被 List 的 beforeRouteEnter/Update 守卫重写掉，所以用一次性标记：
 *  · 侧栏点击 → 置 true → 跳转 /list
 *  · List 视图（created 或存活中）消费标记 → wallVisible = true → 清标记
 */
export const wallOpenRequest = ref(false)
