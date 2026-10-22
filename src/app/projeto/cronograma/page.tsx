'use client'

import { useProject } from '../../../state/ProjectProvider'
import { Gantt } from '../../../views/Gantt'

export default function CronogramaPage() {
  const { snap, openTask, visibleTasks } = useProject()
  if (!snap) return null
  return <Gantt snap={snap} visible={visibleTasks} onOpen={openTask} />
}
