import { teachingWeekInfo, teachingResumeLabel } from '@/lib/teaching-weeks';
import type { Data, RecordRow } from '@/lib/model';
export function SemesterWeek({
  semester,
  now,
  data,
}: {
  semester: RecordRow;
  now: string;
  data: Data;
}) {
  const info = teachingWeekInfo(semester, now, data);
  return (
    <div className="semester-week">
      <strong className="semester-summary">
        <span>{semester.name}</span>
        <span aria-hidden="true">|</span>
        <span>{info.label}</span>
      </strong>
      {info.resumeDate && <p>{teachingResumeLabel(info)}</p>}
    </div>
  );
}
