import Layout from './Layout.vue'
import SharedCourses from './SharedCourses.vue'
import CourseDetail from './CourseDetail.vue'
import BountySection from './BountySection.vue'
import Quiz from './Quiz.vue'
import StudyPlan from './StudyPlan.vue'
import AuthPanel from './AuthPanel.vue'
import Checkin from './Checkin.vue'
import './style.css'

export default {
  Layout,
  enhanceApp({ app }) {
    app.component('SharedCourses', SharedCourses)
    app.component('CourseDetail', CourseDetail)
    app.component('BountySection', BountySection)
    app.component('Quiz', Quiz)
    app.component('StudyPlan', StudyPlan)
    app.component('AuthPanel', AuthPanel)
    app.component('Checkin', Checkin)
  },
}
