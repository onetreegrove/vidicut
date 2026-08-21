<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Users, Film, Layers, CheckCircle2, Terminal, RefreshCw, ShieldAlert, Cpu } from 'lucide-vue-next'
import { apiFetch } from '../lib/api'

interface Stats {
  total_authors: number
  active_authors: number
  total_media: number
  total_tasks: number
  total_mixes: number
}

interface LogItem {
  id: number
  nickname?: string
  cycle_index: number
  log_level: 'INFO' | 'WARN' | 'ERROR'
  message: string
  created_at: string
}

const stats = ref<Stats>({
  total_authors: 0,
  active_authors: 0,
  total_media: 0,
  total_tasks: 0,
  total_mixes: 0,
})

const logs = ref<LogItem[]>([])
const loading = ref(true)
let eventSource: EventSource | null = null

async function fetchStats() {
  try {
    const res = await apiFetch('/api/dashboard/stats')
    const json = await res.json()
    if (json.success) {
      stats.value = json.data
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function initSseLogs() {
  eventSource = new EventSource('/api/logs/stream')
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'history') {
        logs.value = data.logs
      } else if (data.type === 'new') {
        logs.value.push(...data.logs)
        if (logs.value.length > 100) {
          logs.value = logs.value.slice(logs.value.length - 100)
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

onMounted(() => {
  fetchStats()
  initSseLogs()
})

onUnmounted(() => {
  if (eventSource) {
    eventSource.close()
  }
})
</script>

<template>
  <div class="space-y-8 max-w-7xl mx-auto">
    <!-- Title Area -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-slate-100">控制台概览</h2>
        <p class="text-sm text-slate-400 mt-1">MySQL 数据中枢实时状态与守护进程运行流控制</p>
      </div>
      <button 
        @click="fetchStats"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-slate-900 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-all shadow-sm"
      >
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" />
        刷新数据
      </button>
    </div>

    <!-- Metric Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      <!-- Card 1 -->
      <div class="p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800/80 shadow-xl relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl group-hover:bg-cyan-500/20 transition-all"></div>
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-400">监控博主总数</span>
          <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Users class="w-5 h-5" />
          </div>
        </div>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-3xl font-bold font-mono text-slate-100">{{ stats.total_authors }}</span>
          <span class="text-xs text-emerald-400 font-medium">({{ stats.active_authors }} 开启中)</span>
        </div>
      </div>

      <!-- Card 2 -->
      <div class="p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800/80 shadow-xl relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all"></div>
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-400">MySQL 媒体素材总数</span>
          <div class="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Film class="w-5 h-5" />
          </div>
        </div>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-3xl font-bold font-mono text-slate-100">{{ stats.total_media.toLocaleString() }}</span>
          <span class="text-xs text-slate-400">条已落盘</span>
        </div>
      </div>

      <!-- Card 3 -->
      <div class="p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800/80 shadow-xl relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition-all"></div>
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-400">已归类合集数</span>
          <div class="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Layers class="w-5 h-5" />
          </div>
        </div>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-3xl font-bold font-mono text-slate-100">{{ stats.total_mixes }}</span>
          <span class="text-xs text-indigo-400 font-medium">个合集专栏</span>
        </div>
      </div>

      <!-- Card 4 -->
      <div class="p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800/80 shadow-xl relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all"></div>
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-400">历史调度工单数</span>
          <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <CheckCircle2 class="w-5 h-5" />
          </div>
        </div>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-3xl font-bold font-mono text-slate-100">{{ stats.total_tasks }}</span>
          <span class="text-xs text-slate-400">项记录</span>
        </div>
      </div>
    </div>

    <!-- Daemon Status Bar -->
    <div class="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <div class="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          <Cpu class="w-6 h-6" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-slate-200">Supervisord 守护进程 (dy_monitor_daemon.ts)</h3>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">RUNNING</span>
          </div>
          <p class="text-xs text-slate-400 mt-1">单进程 PID 锁保活 + 按巡检间隔调度 + 15s~20s 串行打散 Jitter Delay</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400 font-mono">巡检时间间隔: 按博主配置</span>
      </div>
    </div>

    <!-- Log Console Window -->
    <div class="rounded-2xl border border-slate-800/80 bg-slate-950 overflow-hidden shadow-2xl">
      <div class="px-6 py-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Terminal class="w-4 h-4 text-cyan-400" />
          <span class="text-sm font-semibold text-slate-200 font-mono">实时守护进程日志流 (SSE Live Feed)</span>
        </div>
        <span class="text-xs font-mono text-slate-500">最近 100 条</span>
      </div>

      <div class="p-6 font-mono text-xs space-y-2 max-h-96 overflow-y-auto bg-slate-950/90">
        <div v-if="logs.length === 0" class="text-slate-500 text-center py-8">
          数据加载中或暂无实时日志...
        </div>

        <div 
          v-for="item in logs" 
          :key="item.id"
          class="flex items-start gap-3 py-1 border-b border-slate-900/60 hover:bg-slate-900/30 px-2 rounded transition-colors"
        >
          <span class="text-slate-500 shrink-0">{{ new Date(item.created_at).toLocaleTimeString() }}</span>
          
          <span 
            class="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold shrink-0"
            :class="{
              'bg-blue-500/10 text-blue-400 border border-blue-500/20': item.log_level === 'INFO',
              'bg-amber-500/10 text-amber-400 border border-amber-500/20': item.log_level === 'WARN',
              'bg-rose-500/10 text-rose-400 border border-rose-500/20': item.log_level === 'ERROR',
            }"
          >
            {{ item.log_level }}
          </span>

          <span v-if="item.nickname" class="text-cyan-400 font-semibold shrink-0">[{{ item.nickname }}]</span>

          <span class="text-slate-300 break-all">{{ item.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
