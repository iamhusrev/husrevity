import { FormSectionSkeleton, PageHeaderSkeleton } from "@/components/skeletons";

export default function SettingsProfileLoading() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeaderSkeleton withButton={false} />
      <FormSectionSkeleton fields={5} />
      <FormSectionSkeleton fields={3} />
    </div>
  );
}
