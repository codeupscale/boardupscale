import { Link, useLocation, type LinkProps } from 'react-router-dom'
import { issueDetailPath } from '@/lib/routes'
import { getIssueModalNavigateState } from '@/lib/issue-navigation'

interface IssueDetailLinkProps extends Omit<LinkProps, 'to' | 'state'> {
  issueId: string
  /** When true, opens the issue modal over the current page instead of navigating away */
  modal?: boolean
}

export function IssueDetailLink({
  issueId,
  modal = true,
  ...props
}: IssueDetailLinkProps) {
  const location = useLocation()

  return (
    <Link
      to={issueDetailPath(issueId)}
      state={modal ? getIssueModalNavigateState(location) : undefined}
      {...props}
    />
  )
}
