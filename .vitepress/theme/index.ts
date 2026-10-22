import Layout from './Layout.vue'
import SharedCourses from './SharedCourses.vue'
import CourseDetail from './CourseDetail.vue'
import BountySection from './BountySection.vue'
import Quiz from './Quiz.vue'
import StudyPlan from './StudyPlan.vue'
import ContributorsPage from './ContributorsPage.vue'
import ChangelogPage from './ChangelogPage.vue'
import AuthPanel from './AuthPanel.vue'
import Checkin from './Checkin.vue'
import HeroStats from './components/HeroStats.vue'
import MetricsPanel from './components/MetricsPanel.vue'
import InlineMetric from './components/InlineMetric.vue'
import KpSearch from './components/KpSearch.vue'
import SprintPack from './components/SprintPack.vue'
import FootprintPage from './components/FootprintPage.vue'
import StoriesPage from './components/StoriesPage.vue'
import GapBoard from './components/GapBoard.vue'
import MyTerm from './components/MyTerm.vue'
import ArBtn from './components/ArBtn.vue'
import ArBadge from './components/ArBadge.vue'
import ArCard from './components/ArCard.vue'
import ArEmpty from './components/ArEmpty.vue'
import ArLoading from './components/ArLoading.vue'
import ArError from './components/ArError.vue'
import FocusTimer from './components/FocusTimer.vue'
import FocusPage from './components/FocusPage.vue'
import WeeklyReport from './components/WeeklyReport.vue'
import TodoList from './components/TodoList.vue'
import NotePanel from './components/NotePanel.vue'
import FlashCards from './components/FlashCards.vue'
import WrongBook from './components/WrongBook.vue'
import './style.css'

export default {
  Layout,
  enhanceApp({ app }) {
    app.component('SharedCourses', SharedCourses)
    app.component('CourseDetail', CourseDetail)
    app.component('BountySection', BountySection)
    app.component('Quiz', Quiz)
    app.component('StudyPlan', StudyPlan)
    app.component('ContributorsPage', ContributorsPage)
    app.component('ChangelogPage', ChangelogPage)
    app.component('AuthPanel', AuthPanel)
    app.component('Checkin', Checkin)
    app.component('HeroStats', HeroStats)
    app.component('MetricsPanel', MetricsPanel)
    app.component('InlineMetric', InlineMetric)
    app.component('KpSearch', KpSearch)
    app.component('SprintPack', SprintPack)
    app.component('FootprintPage', FootprintPage)
    app.component('StoriesPage', StoriesPage)
    app.component('GapBoard', GapBoard)
    app.component('MyTerm', MyTerm)
    app.component('ArBtn', ArBtn)
    app.component('ArBadge', ArBadge)
    app.component('ArCard', ArCard)
    app.component('ArEmpty', ArEmpty)
    app.component('ArLoading', ArLoading)
    app.component('ArError', ArError)
    app.component('FocusTimer', FocusTimer)
    app.component('FocusPage', FocusPage)
    app.component('WeeklyReport', WeeklyReport)
    app.component('TodoList', TodoList)
    app.component('NotePanel', NotePanel)
    app.component('FlashCards', FlashCards)
    app.component('WrongBook', WrongBook)
  },
}
