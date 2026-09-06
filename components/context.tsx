'use client';
import { createContext, useContext } from 'react';
import type { Data, Entity, RecordRow } from '@/lib/model';
export type Editor = { entity: Entity; row?: RecordRow; prefill?: Record<string, any> };
export type AppContextType = {
  data: Data;
  allData: Data;
  now: string;
  open: (e: Editor) => void;
  save: (e: Entity, row: Record<string, any>, old?: RecordRow) => Promise<void>;
  remove: (e: Entity, row: RecordRow) => Promise<void>;
  reload: () => Promise<void>;
  notify: (s: string) => void;
  go: (url: string) => void;
};
export const AppContext = createContext<AppContextType>(null!);
export const useApp = () => useContext(AppContext);
export function subjectName(data: Data, id?: string) {
  return data.subject.find((s) => s.id === id)?.code ?? 'Personal';
}
export function titleFor(entity: Entity, row: RecordRow, data: Data) {
  if (entity === 'grade') {
    const a =
      data.assignment.find((a) => a.id === row.assignmentId) ??
      data.exam.find((a) => a.id === row.examId);
    return a?.name ?? 'Grade';
  }
  return entity === 'subject' ? `${row.code} · ${row.name}` : row.name;
}
