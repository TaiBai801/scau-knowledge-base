import Layout from './Layout.vue'
import SharedCourses from './SharedCourses.vue'
import CourseDetail from './CourseDetail.vue'
import './style.css'

export default {
  Layout,
  enhanceApp({ app }) {
    app.component('SharedCourses', SharedCourses)
    app.component('CourseDetail', CourseDetail)
  },
}
