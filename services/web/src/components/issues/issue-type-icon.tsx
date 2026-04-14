import { Zap, BookMarked, CheckSquare, Bug, GitBranch } from 'lucide-react'
import { IssueType } from '@/types'
import { cn } from '@/lib/utils'

interface IssueTypeIconProps {
  type: IssueType
  className?: string
}

export function IssueTypeIcon({ type, className }: IssueTypeIconProps) {
  const config = {
    [IssueType.EPIC]: { icon: Zap, color: 'text-purple-500' },
    [IssueType.STORY]: { icon: BookMarked, color: 'text-green-500' },
    [IssueType.TASK]: { icon: CheckSquare, color: 'text-primary' },
    [IssueType.BUG]: { icon: Bug, color: 'text-red-500' },
    [IssueType.SUBTASK]: { icon: GitBranch, color: 'text-muted-foreground' },
  }

  const { icon: Icon, color } = config[type] || config[IssueType.TASK]
  return <Icon className={cn('h-4 w-4', color, className)} />
}
