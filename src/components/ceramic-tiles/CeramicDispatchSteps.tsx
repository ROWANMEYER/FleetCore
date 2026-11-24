import { Check } from "lucide-react";
import styles from "./CeramicMobile.module.css";

export type CeramicDispatchStep = 0 | 1 | 2;
export function CeramicDispatchSteps({ step, disabled, onStepChange }: {
  step: CeramicDispatchStep; disabled: (step: CeramicDispatchStep) => boolean;
  onStepChange: (step: CeramicDispatchStep) => void;
}) {
  return <><p className={styles.stepPill}>Step {step + 1} of 3</p><nav aria-label="Dispatch steps" className={styles.steps}>
    {(["Assign truck & driver", "Arrange stops", "Send"] as const).map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined} disabled={disabled(index as CeramicDispatchStep)} onClick={() => onStepChange(index as CeramicDispatchStep)} className={styles.step}><span className={styles.stepNumber}>{index < step ? <Check size={15} /> : index + 1}</span><span>{label}</span></button>)}
  </nav></>;
}
