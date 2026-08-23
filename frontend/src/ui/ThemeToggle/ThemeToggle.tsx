import type { ThemePreference } from './theme.ts';
import styles from './ThemeToggle.module.css';

const OPTIONS: { value: ThemePreference; label: string; title: string }[] = [
  { value: 'system', label: 'A', title: 'OSの設定に従う' },
  { value: 'light', label: '☀', title: 'ライト' },
  { value: 'dark', label: '☾', title: 'ダーク' },
];

export function ThemeToggle({
  preference,
  onChange,
}: {
  preference: ThemePreference;
  onChange: (next: ThemePreference) => void;
}) {
  return (
    <div className={styles.group} role="group" aria-label="テーマ">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          aria-pressed={preference === option.value}
          title={option.title}
          onClick={() => {
            onChange(option.value);
          }}
        >
          <span aria-hidden="true">{option.label}</span>
          <span className="visually-hidden">{option.title}</span>
        </button>
      ))}
    </div>
  );
}
