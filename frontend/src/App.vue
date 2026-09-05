<template>
  <div v-if="isLoginPage" class="min-h-screen bg-slate-950 text-slate-100">
    <RouterView />
  </div>

  <div v-else class="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
    <!-- Left Navigation Sidebar -->
    <Sidebar />

    <!-- Main Workspace Container -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Top Navbar -->
      <Navbar />

      <!-- Page Content -->
      <main class="flex-1 overflow-y-auto p-6 bg-slate-950">
        <RouterView />
      </main>
    </div>

    <!-- Global Floating AI Ops Companion -->
    <FloatingAiCompanion />

    <!-- Global Modern Toast / Notification Messages -->
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from '@/components/Sidebar.vue'
import Navbar from '@/components/Navbar.vue'
import FloatingAiCompanion from '@/components/FloatingAiCompanion.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import { useSystemStore } from '@/stores/system'

const $route = useRoute()
const isLoginPage = computed(() => $route.path === '/login')

const systemStore = useSystemStore()
onMounted(() => {
  systemStore.fetchPanelSettings()
})
</script>
