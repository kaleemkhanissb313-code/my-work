import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './AppShell'
import { RouteError } from './RouteError'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = <T extends Record<string, any>, K extends keyof T>(f: () => Promise<T>, name: K) =>
  lazy(() => f().then((m) => ({ default: m[name] as T[K] })))

const Dashboard = p(() => import('@/pages/Dashboard'), 'Dashboard')
const LifePage = p(() => import('@/pages/life/LifePage'), 'LifePage')
const HomePage = p(() => import('@/pages/home/HomePage'), 'HomePage')
const WorkPage = p(() => import('@/pages/work/WorkPage'), 'WorkPage')
const ProjectsPage = p(() => import('@/pages/projects/ProjectsPage'), 'ProjectsPage')
const ProjectDetail = p(() => import('@/pages/projects/ProjectDetail'), 'ProjectDetail')
const TasksPage = p(() => import('@/pages/tasks/TasksPage'), 'TasksPage')
const CalendarPage = p(() => import('@/pages/calendar/CalendarPage'), 'CalendarPage')
const TimelinesPage = p(() => import('@/pages/calendar/TimelinesPage'), 'TimelinesPage')
const DocsPage = p(() => import('@/pages/docs/DocsPage'), 'DocsPage')
const DocEditor = p(() => import('@/pages/docs/DocEditor'), 'DocEditor')
const MediaPage = p(() => import('@/pages/media/MediaPage'), 'MediaPage')
const LinksPage = p(() => import('@/pages/links/LinksPage'), 'LinksPage')
const TimePage = p(() => import('@/pages/tools/TimePage'), 'TimePage')
const CalculatorPage = p(() => import('@/pages/tools/CalculatorPage'), 'CalculatorPage')
const NumbersPage = p(() => import('@/pages/tools/NumbersPage'), 'NumbersPage')
const ColorsPage = p(() => import('@/pages/tools/ColorsPage'), 'ColorsPage')
const TextPage = p(() => import('@/pages/tools/TextPage'), 'TextPage')
const GraphsPage = p(() => import('@/pages/graphs/GraphsPage'), 'GraphsPage')
const ReportsPage = p(() => import('@/pages/graphs/ReportsPage'), 'ReportsPage')
const FinancePage = p(() => import('@/pages/finance/FinancePage'), 'FinancePage')
const SecurityPage = p(() => import('@/pages/security/SecurityPage'), 'SecurityPage')
const VaultPage = p(() => import('@/pages/security/VaultPage'), 'VaultPage')
const TrashPage = p(() => import('@/pages/TrashPage'), 'TrashPage')
const SettingsPage = p(() => import('@/pages/SettingsPage'), 'SettingsPage')
const AuthPage = p(() => import('@/pages/AuthPage'), 'AuthPage')

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'life/:tab?', element: <LifePage /> },
      { path: 'home/:tab?', element: <HomePage /> },
      { path: 'work/:tab?', element: <WorkPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetail /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'timelines', element: <TimelinesPage /> },
      { path: 'documents', element: <DocsPage kind="document" /> },
      { path: 'documents/:id', element: <DocEditor /> },
      { path: 'notes', element: <DocsPage kind="note" /> },
      { path: 'notes/:id', element: <DocEditor /> },
      { path: 'templates', element: <DocsPage kind="template" /> },
      { path: 'media', element: <MediaPage /> },
      { path: 'links', element: <LinksPage /> },
      { path: 'time', element: <TimePage /> },
      { path: 'calculator', element: <CalculatorPage /> },
      { path: 'numbers', element: <NumbersPage /> },
      { path: 'colors', element: <ColorsPage /> },
      { path: 'text', element: <TextPage /> },
      { path: 'graphs', element: <GraphsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'finance/:tab?', element: <FinancePage /> },
      { path: 'security', element: <SecurityPage /> },
      { path: 'vault', element: <VaultPage /> },
      { path: 'trash', element: <TrashPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'auth', element: <AuthPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
