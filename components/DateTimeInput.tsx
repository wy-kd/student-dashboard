'use client';
import type { InputHTMLAttributes } from 'react';
/** Native ISO values and pickers stay authoritative; appearance follows the browser locale. */
export function DateTimeInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} lang="en-AU" />;
}
