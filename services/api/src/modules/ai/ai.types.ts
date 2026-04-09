export interface FieldSuggestions {
  type?: string;
  priority?: string;
  title?: string;
  assignees?: AssigneeSuggestion[];
}

export interface AssigneeSuggestion {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  reason: string;
  score: number;
}

export interface IssueSummary {
  summary: string;
  keyDecisions: string[];
  blockers: string[];
  nextSteps: string[];
  generatedAt: string;
}

export interface SprintInsights {
  sprintId: string;
  sprintName: string;
  completionPrediction: {
    percentage: number;
    predictedEndDate: string;
    onTrack: boolean;
  };
  workloadBalance: WorkloadItem[];
  suggestions: string[];
  generatedAt: string;
}

export interface WorkloadItem {
  userId: string;
  displayName: string;
  assignedPoints: number;
  completedPoints: number;
  issueCount: number;
}

export interface AiStatusResponse {
  enabled: boolean;
  available?: boolean;
  provider?: string;
  model?: string;
  embeddingModel?: string;
  usage?: {
    tokensUsedToday: number;
    dailyLimit: number;
    percentUsed: number;
    tier?: 'normal' | 'warning' | 'exhausted';
    resetsAt?: string;
  };
}
