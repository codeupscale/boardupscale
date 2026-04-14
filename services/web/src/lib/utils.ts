import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { IssuePriority } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return format(new Date(date), 'MMM d, yyyy')
}

export function formatRelativeTime(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function formatDuration(minutes: number): string {
  if (!minutes) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function getPriorityColor(priority: IssuePriority): string {
  const map: Record<IssuePriority, string> = {
    [IssuePriority.CRITICAL]: 'text-red-600 bg-red-50',
    [IssuePriority.HIGH]: 'text-orange-600 bg-orange-50',
    [IssuePriority.MEDIUM]: 'text-yellow-600 bg-yellow-50',
    [IssuePriority.LOW]: 'text-blue-600 bg-blue-50',
    [IssuePriority.NONE]: 'text-muted-foreground bg-muted',
  }
  return map[priority] || map[IssuePriority.NONE]
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function generateAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-yellow-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export function slugify(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 10)
}
