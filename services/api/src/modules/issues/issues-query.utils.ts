import { SelectQueryBuilder } from 'typeorm';
import { Issue } from './entities/issue.entity';

/** Adds a non-deleted direct-children count onto each issue row (virtual `childrenCount`). */
export function withChildrenCount(qb: SelectQueryBuilder<Issue>): SelectQueryBuilder<Issue> {
  return qb.loadRelationCountAndMap(
    'issue.childrenCount',
    'issue.children',
    'issueChildren',
    (subQb) => subQb.andWhere('issueChildren.deletedAt IS NULL'),
  );
}
