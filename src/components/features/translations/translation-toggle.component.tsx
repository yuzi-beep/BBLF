import { Languages } from "lucide-react";

import { useT } from "#i18n";
import { cn } from "#lib/shared/utils/tailwind.helper";

type TranslationToggleProps = {
  readonly showOriginal: boolean;
  readonly onToggle: () => void;
  readonly className?: string;
};

export function TranslationToggle({
  showOriginal,
  onToggle,
  className,
}: TranslationToggleProps) {
  const t = useT().scope((d) => d.translation);

  return (
    <button
      type="button"
      aria-label={t((d) => d.showOriginal)}
      aria-pressed={showOriginal}
      title={t((d) => (showOriginal ? d.showTranslation : d.showOriginal))}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap text-(--text-muted) transition-colors hover:bg-(--surface-hover) hover:text-(--text-primary) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current aria-pressed:bg-(--surface-hover) aria-pressed:text-(--text-primary)",
        className,
      )}
    >
      <Languages className="size-3.5" aria-hidden="true" />
      {t((d) => d.original)}
    </button>
  );
}
