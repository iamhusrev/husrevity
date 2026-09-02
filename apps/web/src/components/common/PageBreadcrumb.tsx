import React from "react";
import { PageHeader } from "@/components/ui";

interface BreadcrumbProps {
  pageTitle: string;
  /** Optional decorative italic word that replaces the last word in the title. */
  flourish?: string;
  /** Optional eyebrow/kicker (mono uppercase) shown above the title. */
  kicker?: string;
}

const PageBreadcrumb: React.FC<BreadcrumbProps> = (props) => {
  return <PageHeader {...props} />;
};

export default PageBreadcrumb;
