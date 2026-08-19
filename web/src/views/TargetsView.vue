<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Trash2, Play, RefreshCw, Power, ShieldCheck, Check, AlertCircle, Loader2, X } from 'lucide-vue-next'

interface Author {
  id: number
  sec_user_id: string
  nickname: string
  avatar_url?: string
  status: 'active' | 'disabled'
  check_interval_minutes: number
  item_count: number
  last_check_date?: string
  last_check_time?: string
  total_media_count: number
  total_mix_count: number
}

const authors = ref<Author[]>([])
const loading = ref(true)

// 添加博主 Modal 状态
const showAddModal = ref(false)
const inputUrlOrSecId = ref('')
const submitLoading = ref(false)
const submitError = ref('')
const submitSuccess = ref('')

// 删除博主 Modal 状态
const showDeleteModal = ref(false)
const selectedAuthor = ref<Author | null>(null)
const deleteFilesOption = ref(false)
const deleteLoading = ref(false)

async function fetchAuthors() {
  loading.value = true
  try {
    const res = await fetch('/api/authors')
    const json = await res.json()
    if (json.success) {
      authors.value = json.data
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function toggleStatus(author: Author) {
  const nextStatus = author.status === 'active' ? 'disabled' : 'active'
  try {
    const res = await fetch(`/api/authors/${author.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    const json = await res.json()
    if (json.success) {
      author.status = nextStatus
    }
  } catch (e) {
    console.error(e)
  }
}

async function triggerTask(author: Author, type: 'full' | 'incremental') {
  try {
    const res = await fetch('/api/tasks/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_id: author.id, task_type: type }),
    })
    const json = await res.json()
    if (json.success) {
      alert(`已成功创建 [${author.nickname}] 的 ${type === 'full' ? '全量' : '增量'}抓取工单，守护进程将在下一秒开始处理！`)
      fetchAuthors()
    } else {
      alert(`触发失败: ${json.error}`)
    }
  } catch (e: any) {
    alert(`触发异常: ${e.message}`)
  }
}

async function handleAddAuthor() {
  if (!inputUrlOrSecId.value.trim()) {
    submitError.value = '请输入有效的抖音博主链接或 sec_user_id'
    return
  }

  submitLoading.value = true
  submitError.value = ''
  submitSuccess.value = ''

  try {
    const res = await fetch('/api/authors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url_or_sec_id: inputUrlOrSecId.value.trim() }),
    })

    const json = await res.json()
    if (json.success) {
      submitSuccess.value = json.message
      inputUrlOrSecId.value = ''
      fetchAuthors()
      setTimeout(() => {
        showAddModal.value = false
        submitSuccess.value = ''
      }, 1500)
    } else {
      submitError.value = json.error
    }
  } catch (e: any) {
    submitError.value = e.message || '网络请求异常'
  } finally {
    submitLoading.value = false
  }
}

function openDeleteModal(author: Author) {
  selectedAuthor.value = author
  deleteFilesOption.value = false
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!selectedAuthor.value) return
  deleteLoading.value = true
  try {
    const res = await fetch(`/api/authors/${selectedAuthor.value.id}?delete_files=${deleteFilesOption.value}`, {
      method: 'DELETE',
    })
    const json = await res.json()
    if (json.success) {
      showDeleteModal.value = false
      selectedAuthor.value = null
      fetchAuthors()
    } else {
      alert(`删除失败: ${json.error}`)
    }
  } catch (e: any) {
    alert(`删除异常: ${e.message}`)
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => {
  fetchAuthors()
})
</script>

<template>
  <div class="space-y-8 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-slate-100">博主与任务管理</h2>
        <p class="text-sm text-slate-400 mt-1">管理监控列表中的抖音博主、启用/停用状态及发起手动抓取工单</p>
      </div>

      <div class="flex items-center gap-3">
        <button 
          @click="fetchAuthors"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-slate-900 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-all shadow-sm"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" />
          刷新列表
        </button>

        <button 
          @click="showAddModal = true"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 transition-all"
        >
          <Plus class="w-4 h-4" />
          添加新博主任务
        </button>
      </div>
    </div>

    <!-- Data Table Card -->
    <div class="rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md overflow-hidden shadow-2xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-slate-300">
          <thead class="bg-slate-900/80 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th class="px-6 py-4">博主昵称 / ID</th>
              <th class="px-6 py-4">监控状态</th>
              <th class="px-6 py-4">离线已抓取作品</th>
              <th class="px-6 py-4">所属合集数</th>
              <th class="px-6 py-4">最近成功巡检日期</th>
              <th class="px-6 py-4 text-right">操作管理</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-800/60">
            <tr v-if="loading && authors.length === 0">
              <td colspan="6" class="px-6 py-12 text-center text-slate-500">
                <Loader2 class="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                正在从 MySQL 读取博主列表...
              </td>
            </tr>

            <tr v-for="item in authors" :key="item.id" class="hover:bg-slate-900/60 transition-colors">
              <!-- 博主昵称 / SecUID -->
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center font-bold text-cyan-400">
                    {{ item.nickname.substring(0, 1) }}
                  </div>
                  <div>
                    <div class="font-semibold text-slate-100">{{ item.nickname }}</div>
                    <div class="text-[10px] font-mono text-slate-500 max-w-[200px] truncate" :title="item.sec_user_id">
                      {{ item.sec_user_id }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- 监控状态 -->
              <td class="px-6 py-4">
                <button 
                  @click="toggleStatus(item)"
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all"
                  :class="item.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-slate-800'"
                >
                  <Power class="w-3.5 h-3.5" />
                  <span>{{ item.status === 'active' ? '开启监控' : '已停用' }}</span>
                </button>
              </td>

              <!-- 离线作品数 -->
              <td class="px-6 py-4 font-mono font-bold text-slate-200">
                {{ item.total_media_count.toLocaleString() }} 条
              </td>

              <!-- 所属合集数 -->
              <td class="px-6 py-4 font-mono text-indigo-400">
                {{ item.total_mix_count }} 个
              </td>

              <!-- 最近巡检日期 -->
              <td class="px-6 py-4 text-xs font-mono">
                <span v-if="item.last_check_date" class="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {{ item.last_check_date }}
                </span>
                <span v-else class="text-slate-600">待首次巡检</span>
              </td>

              <!-- 操作列 -->
              <td class="px-6 py-4 text-right space-x-2">
                <button 
                  @click="triggerTask(item, 'full')"
                  title="触发全量重推抓取"
                  class="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20 transition-all"
                >
                  <Play class="w-4 h-4" />
                </button>

                <button 
                  @click="openDeleteModal(item)"
                  title="删除博主"
                  class="p-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-all"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 添加博主 Modal -->
    <div v-if="showAddModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div class="w-full max-w-lg p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5 relative">
        <button @click="showAddModal = false" class="absolute top-5 right-5 text-slate-400 hover:text-white">
          <X class="w-5 h-5" />
        </button>

        <div>
          <h3 class="text-lg font-bold text-slate-100">添加新抖音博主监控</h3>
          <p class="text-xs text-slate-400 mt-1">系统将自动解析博主主页链接与昵称，并排队全量抓取工单</p>
        </div>

        <div class="space-y-3">
          <label class="block text-xs font-semibold text-slate-300">抖音博主主页链接 或 sec_user_id</label>
          <input 
            v-model="inputUrlOrSecId"
            type="text" 
            placeholder="例如: https://www.douyin.com/user/MS4wLjABAAAA..."
            class="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>

        <div v-if="submitError" class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span>{{ submitError }}</span>
        </div>

        <div v-if="submitSuccess" class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <Check class="w-4 h-4 shrink-0" />
          <span>{{ submitSuccess }}</span>
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button 
            @click="showAddModal = false" 
            class="px-4 py-2.5 rounded-xl text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
          >
            取消
          </button>
          <button 
            @click="handleAddAuthor"
            :disabled="submitLoading"
            class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 transition-all inline-flex items-center gap-2"
          >
            <Loader2 v-if="submitLoading" class="w-4 h-4 animate-spin" />
            <span>确认添加并全量抓取</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 删除确认 Modal -->
    <div v-if="showDeleteModal && selectedAuthor" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div class="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5 relative">
        <button @click="showDeleteModal = false" class="absolute top-5 right-5 text-slate-400 hover:text-white">
          <X class="w-5 h-5" />
        </button>

        <div>
          <h3 class="text-lg font-bold text-slate-100">确认删除博主</h3>
          <p class="text-xs text-slate-400 mt-1">准备从 MySQL 中移除博主 <strong class="text-cyan-400">[{{ selectedAuthor.nickname }}]</strong></p>
        </div>

        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
          <input 
            id="deleteFilesCheck"
            v-model="deleteFilesOption"
            type="checkbox"
            class="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
          />
          <label for="deleteFilesCheck" class="text-xs text-slate-300 cursor-pointer">
            同时永久物理删除磁盘 <span class="font-mono text-rose-400">./downloads/{{ selectedAuthor.nickname }}</span> 下的所有视频素材
          </label>
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button 
            @click="showDeleteModal = false" 
            class="px-4 py-2.5 rounded-xl text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
          >
            取消
          </button>
          <button 
            @click="confirmDelete"
            :disabled="deleteLoading"
            class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition-all inline-flex items-center gap-2"
          >
            <Loader2 v-if="deleteLoading" class="w-4 h-4 animate-spin" />
            <span>确认删除</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
