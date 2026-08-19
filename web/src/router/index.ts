import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import TargetsView from '../views/TargetsView.vue'
import GalleryView from '../views/GalleryView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView
    },
    {
      path: '/targets',
      name: 'targets',
      component: TargetsView
    },
    {
      path: '/gallery',
      name: 'gallery',
      component: GalleryView
    }
  ]
})

export default router
