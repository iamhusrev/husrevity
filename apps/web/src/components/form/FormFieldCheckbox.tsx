import { Control, Controller, FieldValues, Path } from "react-hook-form";
import Checkbox from "./Checkbox";

interface FormFieldCheckboxProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  id?: string;
  disabled?: boolean;
}

const FormFieldCheckbox = <T extends FieldValues>({
  control,
  name,
  label,
  id,
  disabled = false,
}: FormFieldCheckboxProps<T>) => {
  const fieldId = id ?? name;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Checkbox
          id={fieldId}
          label={label}
          checked={field.value ?? false}
          onChange={field.onChange}
          disabled={disabled}
        />
      )}
    />
  );
};

export default FormFieldCheckbox;
