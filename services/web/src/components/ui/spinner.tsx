import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
}

export function Spinner({ className }: SpinnerProps) {
  return <Loader2 className={cn('animate-spin', className)} />
}

export function LoadingPage() {
  return (
    <div className="flex items-center justify-center w-full h-full min-h-[400px]">
      <Spinner className="h-8 w-8 text-primary" />
    </div>
  )
}
