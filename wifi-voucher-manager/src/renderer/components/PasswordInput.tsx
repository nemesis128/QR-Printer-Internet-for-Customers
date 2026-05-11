import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type FC } from 'react';

interface PasswordInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label?: string;
}

export const PasswordInput: FC<PasswordInputProps> = ({ value, onChange, placeholder, label = 'Contraseña' }) => {
  const [reveal, setReveal] = useState(false);
  const id = useId();

  return (
    <div className="flex flex-col gap-1 text-sm text-textSecondary">
      <label htmlFor={id}>{label}</label>
      <div className="relative flex items-center">
        <input
          id={id}
          type={reveal ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-md border border-border bg-surface pl-3 pr-10 font-mono text-textPrimary outline-none focus:border-accent"
        />
        <button
          type="button"
          aria-label={reveal ? 'Ocultar' : 'Mostrar'}
          onClick={() => setReveal((v) => !v)}
          className="absolute right-2 flex h-6 w-6 items-center justify-center text-textSecondary hover:text-textPrimary"
        >
          {reveal ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
        </button>
      </div>
    </div>
  );
};
