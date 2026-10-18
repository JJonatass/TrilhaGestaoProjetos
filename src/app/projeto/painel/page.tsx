'use client'

import { useProject } from '../../../state/ProjectProvider'
import { Dashboard } from '../../../views/Dashboard'

export default function PainelPage() {
  const { snap, openTask } = useProject()
  if (!snap) return null
  return <Dashboard snap={snap} onOpen={openTask} />
}
