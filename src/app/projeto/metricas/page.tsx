'use client'

import { useProject } from '../../../state/ProjectProvider'
import { Metrics } from '../../../views/Metrics'

export default function MetricasPage() {
  const { snap, openTask } = useProject()
  if (!snap) return null
  return <Metrics snap={snap} onOpen={openTask} />
}
