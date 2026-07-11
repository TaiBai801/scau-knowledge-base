import Layout from './Layout.vue'
import SharedCourses from './SharedCourses.vue'
import './style.css'

export default {
  Layout,
  enhanceApp({ app }) {
    app.component('SharedCourses', SharedCourses)
  },
}
