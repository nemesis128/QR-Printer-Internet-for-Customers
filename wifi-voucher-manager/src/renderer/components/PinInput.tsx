import { useEffect, useRef, type FC, type KeyboardEvent } from 'react';

interface PinInputProps {
  value: string;
  onChange: (next: string) => void;
  shake?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const PinInput: FC<PinInputProps> = ({ value, onChange, shake, disabled, autoFocus }) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const handleChange = (idx: number, raw: string): void => {
    const cleaned = raw.replace(/[^0-9]/g, '');
    if (!cleaned) return;
    const digit = cleaned.slice(-1);
    const next = value.padEnd(4, ' ').split('');
    next[idx] = digit;
    const joined = next.join('').replace(/ /g, '').slice(0, 4);
    onChange(joined);
    if (idx < 3) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  return (
    <div className={`flex gap-2 ${shake ? 'animate-shake' : ''}`}>
      {[0, 1, 2, 3].map((idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={value[idx] ?? ''}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          aria-label={`PIN dígito ${idx + 1}`}
          className="h-14 w-12 rounded-md border border-border bg-surface text-center font-mono text-2xl text-textPrimary outline-none focus:border-accent focus:shadow-[0_0_0_2px_#18181B]"
        />
      ))}
    </div>
  );
};
