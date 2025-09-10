import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface Step {
  id: string;
  title: string;
  status: 'completed' | 'current' | 'upcoming';
}

interface StepperProps {
  steps: Step[];
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({ steps, className }) => {
  return (
    <div className={cn("flex items-center space-x-4", className)}>
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className="flex items-center space-x-2">
            {/* Step Circle */}
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200",
                {
                  "bg-primary text-primary-foreground": step.status === 'completed',
                  "bg-primary text-primary-foreground border-2 border-primary": step.status === 'current',
                  "bg-muted text-muted-foreground border border-border": step.status === 'upcoming'
                }
              )}
            >
              {step.status === 'completed' ? (
                <Check className="w-4 h-4" />
              ) : (
                <span>{index + 1}</span>
              )}
            </div>
            
            {/* Step Title */}
            <span
              className={cn(
                "text-sm font-medium transition-colors duration-200",
                {
                  "text-primary": step.status === 'completed' || step.status === 'current',
                  "text-muted-foreground": step.status === 'upcoming'
                }
              )}
            >
              {step.title}
            </span>
          </div>
          
          {/* Connector Line */}
          {index < steps.length - 1 && (
            <div
              className={cn(
                "h-px w-8 transition-colors duration-200",
                {
                  "bg-primary": step.status === 'completed',
                  "bg-border": step.status === 'current' || step.status === 'upcoming'
                }
              )}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};