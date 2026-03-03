import { Draggable } from '@hello-pangea/dnd'
import { Issue } from '@/types'
import { IssueCard } from '@/components/issues/issue-card'

interface BoardCardProps {
  issue: Issue
  index: number
}

export function BoardCard({ issue, index }: BoardCardProps) {
  return (
    <Draggable draggableId={issue.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={snapshot.isDragging ? 'opacity-90 rotate-1' : ''}
        >
          <IssueCard issue={issue} />
        </div>
      )}
    </Draggable>
  )
}
