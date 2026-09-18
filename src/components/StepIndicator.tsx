import { Check } from "lucide-react";

interface Step {
  label: string;
  description?: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  completedSteps?: boolean[];
  onStepClick?: (step: number) => void;
}

export default function StepIndicator({ steps, currentStep, completedSteps, onStepClick }: StepIndicatorProps) {
  return (
    <nav aria-label="Workflow progress" className="w-full">
      <ol className="flex items-center justify-between gap-1 sm:gap-0" role="list">
        {steps.map((step, i) => {
          const completed = completedSteps ? Boolean(completedSteps[i]) : i < currentStep;
          return (
          <li key={i} className="flex flex-1 items-center" aria-current={i === currentStep ? "step" : undefined}>
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => onStepClick?.(i)}
                className={`flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-full text-[10px] sm:text-xs font-bold transition-all duration-300 cursor-pointer hover:ring-2 hover:ring-primary/40 ${
                  completed && i !== currentStep
                    ? "step-completed"
                    : i === currentStep
                    ? "step-active shadow-lg shadow-primary/25"
                    : "step-pending opacity-80"
                }`}
                aria-label={`Step ${i + 1}: ${step.label}${i === currentStep ? " (current)" : completed ? " (completed)" : ""}`}
              >
                {completed && i !== currentStep ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : i + 1}
              </button>
              <span
                onClick={() => onStepClick?.(i)}
                className={`text-[9px] sm:text-[10px] font-medium text-center max-w-[50px] sm:max-w-[70px] leading-tight cursor-pointer hover:text-primary transition-colors ${
                  i <= currentStep ? "text-foreground" : "text-foreground/70"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="mx-1 sm:mx-2 h-px flex-1 bg-border" aria-hidden="true">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: completed ? "100%" : "0%" }}
                />
              </div>
            )}
          </li>
          );
        })}
      </ol>
    </nav>
  );
}
