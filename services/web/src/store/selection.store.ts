import { create } from 'zustand'

interface SelectionState {
  selectedIssueIds: Set<string>
  toggleIssue: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
  isSelected: (id: string) => boolean
  selectRange: (ids: string[]) => void
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedIssueIds: new Set<string>(),

  toggleIssue: (id: string) =>
    set((state) => {
      const next = new Set(state.selectedIssueIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedIssueIds: next }
    }),

  selectAll: (ids: string[]) =>
    set((state) => {
      const allSelected = ids.every((id) => state.selectedIssueIds.has(id))
      if (allSelected) {
        // Deselect all provided ids
        const next = new Set(state.selectedIssueIds)
        ids.forEach((id) => next.delete(id))
        return { selectedIssueIds: next }
      }
      // Select all provided ids
      const next = new Set(state.selectedIssueIds)
      ids.forEach((id) => next.add(id))
      return { selectedIssueIds: next }
    }),

  clearSelection: () => set({ selectedIssueIds: new Set<string>() }),

  isSelected: (id: string) => get().selectedIssueIds.has(id),

  selectRange: (ids: string[]) =>
    set((state) => {
      const next = new Set(state.selectedIssueIds)
      ids.forEach((id) => next.add(id))
      return { selectedIssueIds: next }
    }),
}))
