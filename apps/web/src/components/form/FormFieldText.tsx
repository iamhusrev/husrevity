import { Control, Controller, FieldValues, Path } from "react-hook-form";
import FormFieldLabel from "./FormFieldLabel";

interface FormFieldTextProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  required?: boolean;
  id?: string;
  type?: "text" | "password" | "email";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const FormFieldText = <T extends FieldValues>({
  control,
  name,
  label,
  required,
  id,
  type = "text",
  placeholder,
  className = "",
  disabled = false,
}: FormFieldTextProps<T>) => {
  const fieldId = id ?? name;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error;
        const success = !!field.value && !error;

        let inputClasses = `h-11 w-full rounded-lg border px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 ${className}`;

        if (disabled) {
          inputClasses +=
            " bg-gray-100 text-gray-500 border-gray-300 opacity-40 cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
        } else if (error) {
          inputClasses +=
            " border-error-500 focus:border-error-300 focus:ring-error-500/20 dark:border-error-500 dark:text-error-400";
        } else if (success) {
          inputClasses +=
            " border-success-500 focus:border-success-300 focus:ring-success-500/20 dark:border-success-500 dark:text-success-400";
        } else {
          inputClasses +=
            " bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700";
        }

        return (
          <div>
            <FormFieldLabel htmlFor={fieldId}>
              {label}
              {required && <span className="text-error-500 ml-0.5">*</span>}
            </FormFieldLabel>
            <input
              type={type}
              id={fieldId}
              placeholder={placeholder}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
              disabled={disabled}
              className={inputClasses}
            />
            {error && <p className="mt-1.5 text-xs text-error-500">{error.message}</p>}
          </div>
        );
      }}
    />
  );
};

export default FormFieldText;
