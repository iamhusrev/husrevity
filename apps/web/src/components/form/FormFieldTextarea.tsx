import { Control, Controller, FieldValues, Path } from "react-hook-form";
import FormFieldLabel from "./FormFieldLabel";

interface FormFieldTextareaProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  required?: boolean;
  id?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

const FormFieldTextarea = <T extends FieldValues>({
  control,
  name,
  label,
  required,
  id,
  placeholder,
  rows = 3,
  className = "",
  disabled = false,
}: FormFieldTextareaProps<T>) => {
  const fieldId = id ?? name;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error;

        let textareaClasses = `w-full rounded-lg border px-4 py-2.5 text-sm shadow-theme-xs focus:outline-hidden focus:ring-3 ${className}`;

        if (disabled) {
          textareaClasses +=
            " bg-gray-100 text-gray-500 border-gray-300 opacity-40 cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
        } else if (error) {
          textareaClasses +=
            " bg-transparent border-error-500 focus:border-error-300 focus:ring-error-500/20 dark:bg-gray-900 dark:border-error-500 dark:text-white/90";
        } else {
          textareaClasses +=
            " bg-transparent text-gray-900 border-gray-300 focus:border-brand-300 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
        }

        return (
          <div>
            <FormFieldLabel htmlFor={fieldId}>
              {label}
              {required && <span className="text-error-500 ml-0.5">*</span>}
            </FormFieldLabel>
            <textarea
              id={fieldId}
              rows={rows}
              placeholder={placeholder}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
              disabled={disabled}
              className={textareaClasses}
            />
            {error && <p className="mt-1.5 text-xs text-error-500">{error.message}</p>}
          </div>
        );
      }}
    />
  );
};

export default FormFieldTextarea;
