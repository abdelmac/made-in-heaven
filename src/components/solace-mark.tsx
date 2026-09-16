import { SOLACE_MARK_PATH } from '@/lib/brand';

export function SolaceMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={SOLACE_MARK_PATH} />
    </svg>
  );
}
