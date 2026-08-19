<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { LayoutDashboard, Users, Film, Activity, Server, ShieldCheck } from 'lucide-vue-next'

const route = useRoute()
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
    <!-- 左侧 Sidebar -->
    <aside class="w-64 bg-slate-900/80 backdrop-blur-md border-r border-slate-800 flex flex-col z-20">
      <!-- Header Logo -->
      <div class="h-16 px-6 flex items-center gap-3 border-b border-slate-800/60">
        <div class="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
          <Film class="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 class="font-bold text-sm text-slate-100 tracking-wide">抖音智能抓取系统</h1>
          <p class="text-[10px] text-cyan-400 font-mono">v2.0 · MySQL Console</p>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 p-4 space-y-1">
        <RouterLink
          to="/"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
          :class="route.path === '/' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'"
        >
          <LayoutDashboard class="w-4 h-4" />
          <span>控制台概览</span>
        </RouterLink>

        <RouterLink
          to="/targets"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
          :class="route.path === '/targets' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'"
        >
          <Users class="w-4 h-4" />
          <span>博主与任务管理</span>
        </RouterLink>

        <RouterLink
          to="/gallery"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
          :class="route.path === '/gallery' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'"
        >
          <Film class="w-4 h-4" />
          <span>媒体素材库</span>
        </RouterLink>
      </nav>

      <!-- Bottom System Status -->
      <div class="p-4 border-t border-slate-800/60 bg-slate-950/40">
        <div class="flex items-center justify-between text-xs mb-2">
          <span class="text-slate-400 flex items-center gap-1.5">
            <Server class="w-3.5 h-3.5 text-emerald-400" />
            MySQL 状态
          </span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">已连接</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400 flex items-center gap-1.5">
            <ShieldCheck class="w-3.5 h-3.5 text-cyan-400" />
            防风控保护
          </span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">单线程串行</span>
        </div>
      </div>
    </aside>

    <!-- 右侧内容区域 -->
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-950">
      <!-- 头部 Header -->
      <header class="h-16 border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-md px-8 flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm text-slate-400">
          <Activity class="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>系统常驻守护进程: <strong class="text-slate-200 font-mono">Supervisord 托管中</strong></span>
        </div>

        <div class="flex items-center gap-4 text-xs font-mono text-slate-400">
          <span class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            实时同步生效
          </span>
        </div>
      </header>

      <!-- 主视图区域 -->
      <main class="flex-1 overflow-y-auto p-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>
