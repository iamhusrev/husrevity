# Form Field Components

Tüm form field component'ları `react-hook-form` ile entegre çalışır. Her component label, input ve hata mesajını tek bir blokta render eder — ayrıca `FormFieldLabel` kullanmaya gerek yoktur.

## Genel Kurallar

- Her component `control` ve `name` alır (zorunlu).
- `name` değeri `useForm` schema'sındaki field adıyla birebir eşleşmeli.
- `label` her component'ta zorunludur (string).
- `required` prop'u label'a görsel `*` ekler — asıl validasyon yine zod/schema üzerinden yapılır.
- `id` verilmezse `name` değeri kullanılır.

---

## FormFieldText

Serbest metin girişi için.

```tsx
import FormFieldText from "@/components/form/FormFieldText";

<FormFieldText
  control={control}
  name="plate"
  label="Plaka"
  required
  placeholder="34ABC123"
  className="uppercase" // opsiyonel tailwind sınıfı
  disabled={false}
/>;
```

**Props**

| Prop          | Tip          | Zorunlu | Açıklama                |
| ------------- | ------------ | ------- | ----------------------- |
| `control`     | `Control<T>` | ✓       | react-hook-form control |
| `name`        | `Path<T>`    | ✓       | Field adı               |
| `label`       | `string`     | ✓       | Label metni             |
| `required`    | `boolean`    | —       | Label'a `*` ekler       |
| `id`          | `string`     | —       | Default: `name`         |
| `placeholder` | `string`     | —       |                         |
| `className`   | `string`     | —       | Input'a eklenir         |
| `disabled`    | `boolean`    | —       | Default: `false`        |

---

## FormFieldNumber

Sayısal giriş için. `onChange`'de string → number dönüşümü otomatik yapılır.

```tsx
import FormFieldNumber from "@/components/form/FormFieldNumber";

<FormFieldNumber
  control={control}
  name="km"
  label="KM"
  required
  placeholder="0"
  min={0}
  max={9999999}
  step={1}
/>;
```

**Props** — `FormFieldText` props'larına ek olarak:

| Prop   | Tip      | Açıklama       |
| ------ | -------- | -------------- |
| `min`  | `number` | Minimum değer  |
| `max`  | `number` | Maksimum değer |
| `step` | `number` | Artış adımı    |

---

## FormFieldDate

Tarih seçimi için (`type="date"`). Değer `"YYYY-MM-DD"` string formatında tutulur.

```tsx
import FormFieldDate from "@/components/form/FormFieldDate";

<FormFieldDate
  control={control}
  name="uttsMountingDate"
  label="Takılma Tarihi"
  min="2000-01-01"
  max="2100-12-31"
/>;
```

**Props** — `FormFieldText` props'larına ek olarak:

| Prop  | Tip      | Açıklama                                 |
| ----- | -------- | ---------------------------------------- |
| `min` | `string` | `"YYYY-MM-DD"` formatında minimum tarih  |
| `max` | `string` | `"YYYY-MM-DD"` formatında maksimum tarih |

---

## FormFieldDropdown

Select/dropdown için. Seçenekler `options` array'i ile verilir.

```tsx
import FormFieldDropdown from "@/components/form/FormFieldDropdown";
import type { DropdownOption } from "@/components/form/FormFieldDropdown";

// String değerli dropdown
<FormFieldDropdown
  control={control}
  name="fuelType"
  label="Yakıt Tipi"
  required
  placeholder="Seçiniz..."
  options={[
    { value: "DIESEL", label: "Dizel" },
    { value: "GASOLINE", label: "Benzin" },
    { value: "ELECTRIC", label: "Elektrik" },
  ]}
/>

// Number değerli dropdown (ID seçimi)
<FormFieldDropdown
  control={control}
  name="brandId"
  label="Marka"
  required
  placeholder="Marka seçiniz"
  options={brands.map((b) => ({ value: b.id, label: b.name }))}
  valueAsNumber   // string → number dönüşümü otomatik yapılır
/>

// Dinamik / bağımlı dropdown (brand seçilmeden model disabled)
<FormFieldDropdown
  control={control}
  name="modelId"
  label="Model"
  required
  placeholder="Model seçiniz"
  options={models.map((m) => ({ value: m.id, label: m.name }))}
  valueAsNumber
  disabled={!selectedBrandId}
/>
```

**Props**

| Prop            | Tip                | Zorunlu | Açıklama                                                 |
| --------------- | ------------------ | ------- | -------------------------------------------------------- |
| `control`       | `Control<T>`       | ✓       |                                                          |
| `name`          | `Path<T>`          | ✓       |                                                          |
| `label`         | `string`           | ✓       |                                                          |
| `options`       | `DropdownOption[]` | ✓       | `{ value: string \| number, label: string }`             |
| `required`      | `boolean`          | —       |                                                          |
| `placeholder`   | `string`           | —       | Boş seçenek olarak render edilir                         |
| `valueAsNumber` | `boolean`          | —       | Seçilen değeri number'a çevirir, ID alanları için kullan |
| `disabled`      | `boolean`          | —       |                                                          |
| `className`     | `string`           | —       |                                                          |

---

## FormFieldTextarea

Çok satırlı metin girişi için.

```tsx
import FormFieldTextarea from "@/components/form/FormFieldTextarea";

<FormFieldTextarea
  control={control}
  name="notes"
  label="Notlar"
  placeholder="Açıklama giriniz..."
  rows={4}
/>;
```

**Props** — `FormFieldText` props'larına ek olarak:

| Prop   | Tip      | Default | Açıklama            |
| ------ | -------- | ------- | ------------------- |
| `rows` | `number` | `3`     | Textarea yüksekliği |

---

## FormFieldCheckbox

Checkbox için. Label checkbox'ın yanında gösterilir (üstte değil).

```tsx
import FormFieldCheckbox from "@/components/form/FormFieldCheckbox";

<FormFieldCheckbox control={control} name="hasUtts" label="UTTS Takılı" />;
```

**Props**

| Prop       | Tip          | Zorunlu | Açıklama                 |
| ---------- | ------------ | ------- | ------------------------ |
| `control`  | `Control<T>` | ✓       |                          |
| `name`     | `Path<T>`    | ✓       |                          |
| `label`    | `string`     | ✓       | Checkbox yanındaki metin |
| `id`       | `string`     | —       | Default: `name`          |
| `disabled` | `boolean`    | —       |                          |

---

## Tam Örnek

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import FormFieldText from "@/components/form/FormFieldText";
import FormFieldNumber from "@/components/form/FormFieldNumber";
import FormFieldDate from "@/components/form/FormFieldDate";
import FormFieldDropdown from "@/components/form/FormFieldDropdown";
import FormFieldTextarea from "@/components/form/FormFieldTextarea";
import FormFieldCheckbox from "@/components/form/FormFieldCheckbox";

const schema = z.object({
  name: z.string().min(1, "Ad zorunludur"),
  age: z.coerce.number().min(18, "18 yaş üzeri olmalıdır"),
  birthDate: z.string().min(1, "Tarih zorunludur"),
  role: z.string().min(1, "Rol seçiniz"),
  notes: z.string().optional(),
  active: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

export default function ExampleForm() {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", age: 0, birthDate: "", role: "", notes: "", active: true },
  });

  const onSubmit = (data: FormValues) => console.log(data);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
      <FormFieldText control={control} name="name" label="Ad Soyad" required />

      <FormFieldNumber control={control} name="age" label="Yaş" required min={0} />

      <FormFieldDate control={control} name="birthDate" label="Doğum Tarihi" required />

      <FormFieldDropdown
        control={control}
        name="role"
        label="Rol"
        required
        placeholder="Rol seçiniz"
        options={[
          { value: "ADMIN", label: "Yönetici" },
          { value: "DRIVER", label: "Sürücü" },
        ]}
      />

      <FormFieldTextarea control={control} name="notes" label="Notlar" rows={3} />

      <FormFieldCheckbox control={control} name="active" label="Aktif" />

      <button type="submit">Kaydet</button>
    </form>
  );
}
```

---

## Visual States

Her input/select/textarea aşağıdaki state'leri otomatik yönetir:

| State    | Görünüm                               |
| -------- | ------------------------------------- |
| Default  | Gri border, focus'ta brand rengi      |
| Success  | Yeşil border (değer dolu ve hata yok) |
| Error    | Kırmızı border + altında hata mesajı  |
| Disabled | Soluk (opacity-40), tıklanamaz        |
