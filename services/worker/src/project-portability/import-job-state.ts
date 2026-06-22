/** Load/persist checkpoint maps in project_portability_jobs.result_summary */

export interface ImportJobMaps {
  issueSourceToId: Map<string, string>;
  sprintSourceToId: Map<string, string>;
  componentSourceToId: Map<string, string>;
  versionSourceToId: Map<string, string>;
  fieldKeyToId: Map<string, string>;
  importedIssueIds: string[];
  importedAttachmentIds: string[];
}

export function loadImportJobMaps(
  resultSummary: Record<string, unknown> | null | undefined,
): ImportJobMaps {
  const summary = resultSummary ?? {};
  return {
    issueSourceToId: new Map(
      Object.entries((summary.issueSourceIdMap as Record<string, string>) ?? {}),
    ),
    sprintSourceToId: new Map(
      Object.entries((summary.sprintSourceIdMap as Record<string, string>) ?? {}),
    ),
    componentSourceToId: new Map(
      Object.entries((summary.componentSourceIdMap as Record<string, string>) ?? {}),
    ),
    versionSourceToId: new Map(
      Object.entries((summary.versionSourceIdMap as Record<string, string>) ?? {}),
    ),
    fieldKeyToId: new Map(
      Object.entries((summary.fieldKeyToIdMap as Record<string, string>) ?? {}),
    ),
    importedIssueIds: Array.isArray(summary.importedIssueIds)
      ? (summary.importedIssueIds as string[])
      : [],
    importedAttachmentIds: Array.isArray(summary.importedAttachmentIds)
      ? (summary.importedAttachmentIds as string[])
      : [],
  };
}

export function serializeImportJobMaps(
  maps: ImportJobMaps,
  base: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...base,
    issueSourceIdMap: Object.fromEntries(maps.issueSourceToId),
    sprintSourceIdMap: Object.fromEntries(maps.sprintSourceToId),
    componentSourceIdMap: Object.fromEntries(maps.componentSourceToId),
    versionSourceIdMap: Object.fromEntries(maps.versionSourceToId),
    fieldKeyToIdMap: Object.fromEntries(maps.fieldKeyToId),
    importedIssueIds: maps.importedIssueIds,
    importedAttachmentIds: maps.importedAttachmentIds,
  };
}

export function emptyBundleArrays<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}
