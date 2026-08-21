<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { Search, Film, Play, Layers, User, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-vue-next'
import { apiFetch } from '../lib/api'

interface MediaItem {
  id: number
  aweme_id: string
  author_id: number
  title: string
  mix_name: string
  media_type: 'video' | 'images'
  cover_path?: string
  media_path?: string
  published_at?: string
  author_nickname?: string
  author_avatar?: string
}

interface Author {
  id: number
  nickname: string
}

interface MixItem {
  mix_name: string
  count: number
}

const items = ref<MediaItem[]>([])
const authors = ref<Author[]>([])
const mixes = ref<MixItem[]>([])
const loading = ref(true)

// 筛选与搜索
const searchKeyword = ref('')
const selectedAuthorId = ref<number | null>(null)
const selectedMixName = ref<string>('')
const selectedMediaType = ref<string>('')

// 分页
const page = ref(1)
const pageSize = ref(24)
const totalPages = ref(1)
const totalItems = ref(0)

// 视频 Preview Modal 状态
const showPreviewModal = ref(false)
const previewItem = ref<MediaItem | null>(null)

async function fetchFilterOptions() {
  try {
    const resA = await apiFetch('/api/authors')
    const jsonA = await resA.json()
    if (jsonA.success) authors.value = jsonA.data

    const resM = await apiFetch('/api/media/mixes')
    const jsonM = await resM.json()
    if (jsonM.success) mixes.value = jsonM.data
  } catch (e) {
    console.error(e)
  }
}

async function fetchMedia() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('page_size', String(pageSize.value))

    if (selectedAuthorId.value) params.set('author_id', String(selectedAuthorId.value))
    if (selectedMixName.value) params.set('mix_name', selectedMixName.value)
    if (selectedMediaType.value) params.set('media_type', selectedMediaType.value)
    if (searchKeyword.value.trim()) params.set('keyword', searchKeyword.value.trim())

    const res = await apiFetch(`/api/media?${params.toString()}`)
    const json = await res.json()
    if (json.success) {
      items.value = json.data.items
      page.value = json.data.pagination.page
      totalPages.value = json.data.pagination.total_pages
      totalItems.value = json.data.pagination.total
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function openPreview(item: MediaItem) {
  previewItem.value = item
  showPreviewModal.value = true
}

watch([selectedAuthorId, selectedMixName, selectedMediaType], () => {
  page.value = 1
  fetchMedia()
})

let searchDebounceTimer: any = null
function handleSearchInput() {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    page.value = 1
    fetchMedia()
  }, 400)
}

function prevPage() {
  if (page.value > 1) {
    page.value--
    fetchMedia()
  }
}

function nextPage() {
  if (page.value < totalPages.value) {
    page.value++
    fetchMedia()
  }
}

onMounted(() => {
  fetchFilterOptions()
  fetchMedia()
})
</script>

<template>
  <div class="space-y-8 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-slate-100">媒体素材库</h2>
        <p class="text-sm text-slate-400 mt-1">检索已落盘入库的 <strong class="text-cyan-400 font-mono">{{ totalItems.toLocaleString() }}</strong> 条无水印作品，点击即可在线播放</p>
      </div>

      <!-- 搜索框 -->
      <div class="relative w-full md:w-80">
        <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
        <input 
          v-model="searchKeyword"
          @input="handleSearchInput"
          type="text"
          placeholder="搜索作品标题关键词..."
          class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
        />
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 flex flex-wrap items-center gap-4">
      <!-- 按博主筛选 -->
      <div class="flex items-center gap-2">
        <User class="w-4 h-4 text-slate-400" />
        <select 
          v-model="selectedAuthorId" 
          class="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500"
        >
          <option :value="null">全部分类博主</option>
          <option v-for="a in authors" :key="a.id" :value="a.id">{{ a.nickname }}</option>
        </select>
      </div>

      <!-- 按合集筛选 -->
      <div class="flex items-center gap-2">
        <Layers class="w-4 h-4 text-slate-400" />
        <select 
          v-model="selectedMixName" 
          class="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500 max-w-xs"
        >
          <option value="">全部所属合集</option>
          <option v-for="m in mixes" :key="m.mix_name" :value="m.mix_name">
            {{ m.mix_name }} ({{ m.count }})
          </option>
        </select>
      </div>

      <!-- 按媒体类型筛选 -->
      <div class="flex items-center gap-2">
        <Film class="w-4 h-4 text-slate-400" />
        <select 
          v-model="selectedMediaType" 
          class="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500"
        >
          <option value="">全部媒体类型</option>
          <option value="video">视频文件 (MP4)</option>
          <option value="images">图集作品 (JPG)</option>
        </select>
      </div>
    </div>

    <!-- Media Cards Grid -->
    <div v-if="loading && items.length === 0" class="py-24 text-center text-slate-500">
      <Loader2 class="w-8 h-8 animate-spin mx-auto mb-3 text-cyan-400" />
      <span>正在从 MySQL 数据库检索作品列表中...</span>
    </div>

    <div v-else-if="items.length === 0" class="py-24 text-center text-slate-500">
      未查找到符合条件的作品素材
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      <div 
        v-for="item in items" 
        :key="item.id"
        @click="openPreview(item)"
        class="group bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg hover:border-cyan-500/50 hover:shadow-cyan-500/10 transition-all cursor-pointer flex flex-col"
      >
        <!-- 封面区域 -->
        <div class="aspect-video bg-slate-950 relative overflow-hidden flex items-center justify-center">
          <img 
            v-if="item.cover_path" 
            :src="`/${item.cover_path}`" 
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            alt="cover"
          />
          <div v-else class="text-slate-600 font-mono text-xs">无封面图</div>

          <!-- Play Button Overlay -->
          <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div class="p-3.5 rounded-full bg-cyan-500 text-white shadow-xl transform scale-75 group-hover:scale-100 transition-transform">
              <Play class="w-6 h-6 fill-current" />
            </div>
          </div>

          <!-- Mix Badge -->
          <div v-if="item.mix_name && item.mix_name !== '单视频'" class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-indigo-500/80 backdrop-blur-md text-[10px] font-semibold text-white">
            {{ item.mix_name }}
          </div>
        </div>

        <!-- 描述区域 -->
        <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
          <h4 class="text-xs font-semibold text-slate-200 line-clamp-2 leading-relaxed group-hover:text-cyan-400 transition-colors">
            {{ item.title || '无标题作品' }}
          </h4>

          <div class="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
            <span class="font-medium text-slate-300 truncate max-w-[120px]">{{ item.author_nickname }}</span>
            <span v-if="item.published_at" class="font-mono text-slate-500">
              {{ new Date(item.published_at).toLocaleDateString() }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between border-t border-slate-800/80 pt-6">
      <span class="text-xs text-slate-400 font-mono">
        第 {{ page }} / {{ totalPages }} 页 (共 {{ totalItems.toLocaleString() }} 条)
      </span>

      <div class="flex items-center gap-2">
        <button 
          @click="prevPage" 
          :disabled="page === 1"
          class="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft class="w-4 h-4" />
        </button>

        <button 
          @click="nextPage" 
          :disabled="page === totalPages"
          class="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Video Preview Modal -->
    <div v-if="showPreviewModal && previewItem" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div class="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative">
        <button @click="showPreviewModal = false" class="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-950/60 text-slate-300 hover:text-white backdrop-blur-md">
          <X class="w-5 h-5" />
        </button>

        <div class="p-6 border-b border-slate-800/80">
          <span class="text-xs font-semibold text-cyan-400 font-mono">[{{ previewItem.author_nickname }}]</span>
          <h3 class="text-base font-bold text-slate-100 mt-1">{{ previewItem.title }}</h3>
        </div>

        <div class="p-6 flex items-center justify-center bg-black">
          <video 
            v-if="previewItem.media_type === 'video' && previewItem.media_path" 
            :src="`/${previewItem.media_path}`" 
            controls 
            autoplay 
            class="max-h-[60vh] w-full rounded-2xl shadow-2xl"
          ></video>
          <img
            v-else-if="previewItem.media_type === 'images' && previewItem.media_path"
            :src="`/${previewItem.media_path}`"
            class="max-h-[60vh] w-auto max-w-full rounded-2xl shadow-2xl object-contain"
            alt="preview"
          />
          <div v-else class="py-12 text-slate-500">无法在线读取媒体文件</div>
        </div>
      </div>
    </div>
  </div>
</template>
