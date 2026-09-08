'use client';
import { useId, type InputHTMLAttributes } from 'react';
import { formatDate, formatTime, formatDateTime } from '@/lib/format';
/** Keep native ISO input values and pickers; show an explicit Australian interpretation. */
export function DateTimeInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const hint = useId(),
    value = String(props.value ?? '');
  const display =
    props.type === 'time'
      ? formatTime(value)
      : props.type === 'date'
        ? formatDate(value)
        : formatDateTime(value);
  return (
    <span className="date-input">
      <input
        {...props}
        lang="en-AU"
        aria-describedby={[props['aria-describedby'], hint].filter(Boolean).join(' ')}
      />
      <small id={hint}>
        {value
          ? display
          : props.type === 'time'
            ? 'h:mm AM/PM'
            : props.type === 'date'
              ? 'DD/MM/YYYY'
              : 'DD/MM/YYYY · h:mm AM/PM'}
      </small>
    </span>
  );
}
