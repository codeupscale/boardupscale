import { ProjectTypeValue } from '../../projects/project-type';

export const PROJECT_BUNDLE_VERSION = '1.1.0' as const;
export const SUPPORTED_BUNDLE_VERSIONS = ['1.0.0', '1.1.0'] as const;
export type ProjectBundleVersion = (typeof SUPPORTED_BUNDLE_VERSIONS)[number];

export type BundleStatusCategory = 'todo' | 'in_progress' | 'done';

export interface BundleManifest {
  version: typeof PROJECT_BUNDLE_VERSION;
  exportId: string;
  exportedAt: string;
  sourceProjectId: string;
  sourceProjectKey: string;
  sourceProjectType: ProjectTypeValue;
  organizationId: string;
}

export interface BundleProjectMeta {
  name: string;
  key: string;
  description: string | null;
  type: ProjectTypeValue;
  settings: Record<string, unknown> | null;
  iconUrl: string | null;
  color: string | null;
}

export interface BundleStatus {
  sourceId: string;
  name: string;
  category: BundleStatusCategory;
  color: string;
  position: number;
  isDefault: boolean;
  wipLimit: number;
}

export interface BundleSprint {
  sourceId: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  completedAt: string | null;
}

export interface BundleMember {
  userEmail: string;
  displayName: string;
  role: string;
}

export interface BundleIssue {
  sourceId: string;
  sourceKey: string;
  number: number;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  statusSourceId: string | null;
  statusName: string;
  statusCategory: BundleStatusCategory;
  sprintSourceId: string | null;
  sprintName: string | null;
  parentSourceId: string | null;
  assigneeEmail: string | null;
  reporterEmail: string;
  storyPoints: number | null;
  timeEstimate: number | null;
  timeSpent: number;
  dueDate: string | null;
  labels: string[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface BundleComment {
  sourceId: string;
  issueSourceId: string;
  authorEmail: string;
  content: string;
  createdAt: string;
}

export interface BundleCustomFieldDefinition {
  sourceId: string;
  name: string;
  fieldKey: string;
  fieldType: string;
  description: string | null;
  isRequired: boolean;
  defaultValue: unknown;
  options: unknown;
  position: number;
}

export interface BundleCustomFieldValue {
  issueSourceId: string;
  fieldKey: string;
  value: unknown;
}

export interface BundleComponent {
  sourceId: string;
  name: string;
  description: string | null;
  leadEmail: string | null;
}

export interface BundleVersion {
  sourceId: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  releaseDate: string | null;
  releasedAt: string | null;
}

export interface BundleIssueComponent {
  issueSourceId: string;
  componentSourceId: string;
}

export interface BundleIssueVersion {
  issueSourceId: string;
  versionSourceId: string;
  relationType: string;
}

export interface BundleAttachment {
  sourceId: string;
  issueSourceId: string;
  commentSourceId: string | null;
  uploaderEmail: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  storageBucket: string;
  createdAt: string;
}

export interface BundleIssueLink {
  sourceId: string;
  sourceIssueSourceId: string;
  targetIssueSourceId: string;
  linkType: string;
  createdByEmail: string;
  createdAt: string;
}

export interface BundleIssueWatcher {
  issueSourceId: string;
  userEmail: string;
  createdAt: string;
}

export interface BundleWorkLog {
  sourceId: string;
  issueSourceId: string;
  userEmail: string;
  timeSpent: number;
  description: string | null;
  loggedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBundle {
  manifest: BundleManifest;
  project: BundleProjectMeta;
  statuses: BundleStatus[];
  sprints: BundleSprint[];
  members: BundleMember[];
  issues: BundleIssue[];
  comments: BundleComment[];
  customFieldDefinitions: BundleCustomFieldDefinition[];
  customFieldValues: BundleCustomFieldValue[];
  components: BundleComponent[];
  versions: BundleVersion[];
  issueComponents: BundleIssueComponent[];
  issueVersions: BundleIssueVersion[];
  attachments: BundleAttachment[];
  issueLinks: BundleIssueLink[];
  issueWatchers: BundleIssueWatcher[];
  workLogs: BundleWorkLog[];
}

export interface StatusMappingEntry {
  sourceName: string;
  sourceCategory: BundleStatusCategory;
  targetName: string;
  targetCategory: BundleStatusCategory;
  method: 'exact' | 'alias' | 'category' | 'custom' | 'created' | 'fallback';
}

export interface ImportPreviewWarning {
  code: string;
  message: string;
  count?: number;
}

export interface ImportPreviewResult {
  sourceType: ProjectTypeValue;
  targetType: ProjectTypeValue;
  sourceProjectKey: string;
  targetProjectKey: string;
  targetProjectName: string;
  totalIssues: number;
  totalSprints: number;
  totalComments: number;
  totalMembers: number;
  totalCustomFields: number;
  statusMappings: StatusMappingEntry[];
  warnings: ImportPreviewWarning[];
  dataLossItems: string[];
  estimatedSeconds: number;
}

export interface PortabilityImportOptions {
  importComments?: boolean;
  importMembers?: boolean;
  importCustomFields?: boolean;
  importSprints?: boolean;
  importComponents?: boolean;
  importVersions?: boolean;
  importAttachments?: boolean;
  importIssueLinks?: boolean;
  importWatchers?: boolean;
  importWorkLogs?: boolean;
  importProjectSettings?: boolean;
  preserveIssueNumbers?: boolean;
  preserveTimestamps?: boolean;
  statusMapping?: Record<string, string>;
  mergeIntoExisting?: boolean;
}

export interface PortabilityResultSummary {
  targetProjectId: string;
  targetProjectKey: string;
  importedIssueIds: string[];
  importedAttachmentIds?: string[];
  issueSourceIdMap?: Record<string, string>;
  sprintSourceIdMap?: Record<string, string>;
  componentSourceIdMap?: Record<string, string>;
  versionSourceIdMap?: Record<string, string>;
  fieldKeyToIdMap?: Record<string, string>;
  importedIssueCount: number;
  failedIssueCount: number;
  failedAttachmentCount?: number;
  sprintsStripped: number;
  backlogRemapped: number;
  durationMs: number;
}

export type PortabilityJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'undone';

export interface PortabilityJobHealth {
  /** BullMQ job state: waiting | active | delayed | failed | completed | unknown | missing */
  bullmqState: string | null;
  queueWaiting: number;
  queueActive: number;
  isStalled: boolean;
  stallReason: string | null;
  canRetry: boolean;
  canCancel: boolean;
  workerHint: string | null;
  pendingSeconds: number;
  bundleAvailable: boolean;
}

export interface PortabilityJobStatusResponse extends PortabilityJobHealth {
  id: string;
  status: PortabilityJobStatus;
  currentPhase: number;
  totalIssues: number;
  processedIssues: number;
  failedIssues: number;
  totalComments: number;
  processedComments: number;
  totalSprints: number;
  processedSprints: number;
  totalAttachments: number;
  processedAttachments: number;
  targetProjectId: string | null;
  targetProjectKey: string;
  targetProjectName: string;
  targetType: ProjectTypeValue;
  sourceType: ProjectTypeValue | null;
  previewResult: ImportPreviewResult | null;
  resultSummary: PortabilityResultSummary | null;
  errorLog: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
